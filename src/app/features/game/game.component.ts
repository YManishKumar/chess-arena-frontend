import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Chess, Square, Piece } from 'chess.js';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';
import { GameService, Game } from '../../core/services/game.service';
import { AiCoachService, HintResponse } from '../../core/services/ai-coach.service';
import { ApiService } from '../../core/services/api.service';
import { ChessBoard3DComponent } from './board-3d/chess-board-3d.component';

interface Cell {
  square: Square;
  piece: Piece | null;
  isLight: boolean;
  isSelected: boolean;
  isLegalMove: boolean;
  isLastMove: boolean;
  isCheck: boolean;
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, RouterLink, ChessBoard3DComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.scss']
})
export class GameComponent implements OnInit, OnDestroy {
  readonly PIECES: Record<string, string> = {
    'wK':'♔','wQ':'♕','wR':'♖','wB':'♗','wN':'♘','wP':'♙',
    'bK':'♚','bQ':'♛','bR':'♜','bB':'♝','bN':'♞','bP':'♟',
  };

  private chess       = new Chess();
  private gameChannel!: RealtimeChannel;
  private gameId      = '';

  // Game state
  game: Game | null   = null;
  board: Cell[][]     = [];
  moveHistory: string[] = [];
  selectedSquare: Square | null = null;
  legalMoves: Square[]          = [];
  lastMove: { from: Square; to: Square } | null = null;
  gameStatus = '';
  isFlipped  = false;

  // My identity
  myEmail  = '';
  myColor: 'white' | 'black' | null = null;

  // UI state
  loading      = true;
  movePending  = false;
  lastMoveFlash = false;
  resignConfirm = false;
  viewMode: '2d' | '3d' = '2d';

  // Game-over overlay
  showGameOverModal = false;
  leaderboard: { name: string; email: string; points: number }[] = [];
  leaderboardLoading = false;
  myPoints: number | null = null;

  toggleViewMode() { this.viewMode = this.viewMode === '2d' ? '3d' : '2d'; }

  clickSquare3D(sq: Square) {
    const flat = this.board.flat();
    const cell = flat.find(c => c.square === sq);
    if (cell) { this.clickSquare(cell); return; }
    const piece = this.chess.get(sq);
    this.clickSquare({ square: sq, piece: piece || null, isLight: false, isSelected: false, isLegalMove: false, isLastMove: false, isCheck: false });
  }

  get checkSq(): Square | null { return this.getCheckSquare(); }

  // AI Coach
  hintLoading    = false;
  explainLoading = false;
  hintResult: HintResponse | null = null;
  explainResult  = '';
  coachOpen      = false;
  lastExplainedMove = '';
  aiError        = '';
  selectedLang   = 'english';
  readonly langs = [
    { value: 'english', label: 'English' },
    { value: 'hindi',   label: 'हिंदी' },
    { value: 'odia',    label: 'ଓଡ଼ିଆ' },
  ];

  // Commentary
  commentary        = '';
  commentaryLoading = false;
  commentaryEnabled = false;
  voiceEnabled      = false;
  availableVoices: SpeechSynthesisVoice[] = [];
  selectedVoice: SpeechSynthesisVoice | null = null;
  showVoicePicker = false;

  toggleVoice() { this.voiceEnabled = !this.voiceEnabled; }
  toggleVoicePicker() { this.showVoicePicker = !this.showVoicePicker; }

  loadVoices() {
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const ALLOWED_LANGS = ['en-IN', 'hi-IN', 'or-IN', 'te-IN'];
      this.availableVoices = all.filter(v => ALLOWED_LANGS.includes(v.lang));
      if (!this.availableVoices.length) this.availableVoices = all;
      if (!this.selectedVoice && this.availableVoices.length) {
        this.selectedVoice = this.availableVoices.find(v => v.lang === 'en-IN') || this.availableVoices[0];
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }

  selectVoice(voice: SpeechSynthesisVoice) {
    this.selectedVoice = voice;
    this.showVoicePicker = false;
    this.previewVoice(voice);
  }

  private previewVoice(voice: SpeechSynthesisVoice) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const samples: Record<string, string> = {
      'en-IN': 'Hello! I am your Chess Arena commentator. What a move!',
      'hi-IN': 'नमस्ते! मैं आपका शतरंज कमेंटेटर हूँ।',
      'or-IN': 'ନମସ୍କାର! ମୁଁ ଆପଣଙ୍କ ଶତରଞ୍ଜ ଧାରା ଭାଷ୍ୟକାର।',
      'te-IN': 'నమస్కారం! నేను మీ చెస్ కామెంటేటర్‌ను.',
    };
    const text = samples[voice.lang] || `Hello! I am your chess commentator. Voice: ${voice.name}.`;
    const utt = new SpeechSynthesisUtterance(text);
    utt.voice = voice;
    utt.lang  = voice.lang;
    utt.rate  = 1.0;
    utt.pitch = 1.1;
    window.speechSynthesis.speak(utt);
  }

  private speak(text: string) {
    if (!this.voiceEnabled || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (this.selectedVoice) {
      utt.voice = this.selectedVoice;
      utt.lang  = this.selectedVoice.lang;
    } else {
      utt.lang = this.selectedLang === 'hindi' ? 'hi-IN'
               : this.selectedLang === 'odia'   ? 'hi-IN'
               : 'en-US';
    }
    utt.rate  = 1.0;
    utt.pitch = 1.1;
    window.speechSynthesis.speak(utt);
  }

  // Lofi beats
  lofiEnabled = false;
  lofiTrack = 0;
  private lofiAudio: HTMLAudioElement | null = null;
  readonly lofiTracks = [
    { name: 'Chess Lofi 1', url: 'https://cdn.pixabay.com/audio/2024/11/25/audio_0e2b56e4f5.mp3' },
    { name: 'Focus Beats', url: 'https://cdn.pixabay.com/audio/2024/03/26/audio_a10c5f6b88.mp3' },
    { name: 'Chill Study', url: 'https://cdn.pixabay.com/audio/2023/10/14/audio_f63189cebd.mp3' },
  ];

  toggleLofi() {
    this.lofiEnabled = !this.lofiEnabled;
    if (this.lofiEnabled) {
      this.lofiAudio = new Audio(this.lofiTracks[this.lofiTrack].url);
      this.lofiAudio.loop = true;
      this.lofiAudio.volume = 0.4;
      this.lofiAudio.play().catch(() => {});
    } else {
      this.lofiAudio?.pause();
      this.lofiAudio = null;
    }
  }

  nextTrack() {
    this.lofiTrack = (this.lofiTrack + 1) % this.lofiTracks.length;
    if (this.lofiEnabled && this.lofiAudio) {
      this.lofiAudio.src = this.lofiTracks[this.lofiTrack].url;
      this.lofiAudio.play().catch(() => {});
    }
  }

  // Reactions
  reactionEmojis = ['💀', '🔥', '😤', '🫡', '👑', '🤡', '🫠', '⚡'];
  floatingReactions: {emoji: string, id: number, x: number}[] = [];
  private reactionCounter = 0;

  sendReaction(emoji: string) {
    const id = this.reactionCounter++;
    const x = 20 + Math.random() * 60;
    this.floatingReactions.push({emoji, id, x});
    setTimeout(() => {
      this.floatingReactions = this.floatingReactions.filter(r => r.id !== id);
    }, 2000);
  }

  // Personality prediction
  personalityResult: {personality_type: string, description: string} | null = null;

  predictPersonality() {
    if (this.moveHistory.length < 5) return;
    this.api.post<any>('/personality/predict', {
      user_id: this.myEmail,
      move_history: this.moveHistory
    }).subscribe({
      next: res => { this.personalityResult = res; },
      error: () => {}
    });
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private gameService: GameService,
    private aiCoach: AiCoachService,
    private api: ApiService
  ) {}

  ngOnInit() {
    this.myEmail = this.auth.getEmail();
    this.gameId  = this.route.snapshot.paramMap.get('id') || '';
    if (!this.gameId) { this.router.navigate(['/friends']); return; }
    this.loadGame();
    this.loadVoices();
  }

  ngOnDestroy() {
    if (this.gameChannel) this.gameService['sb'].removeChannel(this.gameChannel);
    this.lofiAudio?.pause();
    this.lofiAudio = null;
  }

  private loadGame() {
    this.loading = true;
    this.gameService.getGame(this.gameId).subscribe({
      next: game => {
        this.applyGameState(game);
        this.loading = false;
        this.subscribeRealtime();
      },
      error: () => { this.loading = false; this.router.navigate(['/friends']); }
    });
  }

  private applyGameState(game: Game) {
    this.game = game;
    this.chess.load(game.fen);
    this.moveHistory = game.pgn ? game.pgn.split(' ').filter(Boolean) : [];
    this.resolveMyColor(game);
    this.clearSelection();
    this.updateStatus();
  }

  private resolveMyColor(game: Game) {
    this.api.get<{ users: any[] }>(`/users?email=${encodeURIComponent(this.myEmail)}`).subscribe({
      next: () => {},
      error: () => {}
    });
    // Determine color by profile ID stored in game
    // Optimistic: white = first player. We'll compare UUID after loading.
    // For now set color based on turn if not yet resolved.
    if (!this.myColor) {
      this.myColor = 'white'; // default, will flip if needed when IDs resolve
    }
  }

  private subscribeRealtime() {
    this.gameChannel = this.gameService.subscribeToGame(this.gameId, (updatedGame: Game) => {
      this.chess.load(updatedGame.fen);
      this.game         = updatedGame;
      this.moveHistory  = updatedGame.pgn ? updatedGame.pgn.split(' ').filter(Boolean) : [];
      this.clearSelection();
      this.updateStatus();
      this.lastMoveFlash = true;
      setTimeout(() => this.lastMoveFlash = false, 600);
    });
  }

  private updateStatus() {
    if (!this.game) return;
    const s = this.game.status;
    if (s === 'checkmate')  { this.gameStatus = `Checkmate — ${this.chess.turn() === 'w' ? 'Black' : 'White'} wins!`; }
    else if (s === 'draw')  { this.gameStatus = 'Game drawn'; }
    else if (s === 'resigned') { this.gameStatus = 'Game resigned'; }
    else if (this.chess.inCheck()) {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} is in check!`;
    } else {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} to move`;
    }
    if (s !== 'active' && !this.showGameOverModal) {
      this.showGameOverModal = true;
      this.loadGameOverData();
      this.predictPersonality();
    }
  }

  private loadGameOverData() {
    this.leaderboardLoading = true;
    this.api.get<{ leaderboard: any[] }>('/users/leaderboard').subscribe({
      next: res => { this.leaderboard = res.leaderboard; this.leaderboardLoading = false; },
      error: () => { this.leaderboardLoading = false; }
    });
    this.api.get<{ points: number }>(`/users/points?email=${encodeURIComponent(this.myEmail)}`).subscribe({
      next: r => { this.myPoints = r.points; },
      error: () => {}
    });
  }

  closeGameOverModal() { this.showGameOverModal = false; }

  exitGame() { this.router.navigate(['/friends']); }

  restartGame() {
    this.showGameOverModal = false;
    this.router.navigate(['/friends']);
  }

  get gameResultIcon(): string {
    if (!this.game) return '♟';
    if (this.game.status === 'draw') return '🤝';
    if (this.game.status === 'checkmate') return '♔';
    if (this.game.status === 'resigned') return '⚑';
    return '♟';
  }

  get pointsChange(): string {
    if (!this.game) return '';
    if (this.game.status === 'draw') return 'No points change';
    if (this.game.status === 'checkmate') return '+20 pts to winner · −10 pts to loser';
    if (this.game.status === 'resigned') return '−10 pts to resigner';
    return '';
  }

  initials(s: string): string {
    if (!s) return '?';
    const n = s.includes('@') ? s.split('@')[0] : s;
    const p = n.split(/[\s._-]+/).filter(Boolean);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase();
  }

  // ---- Board rendering ----

  renderBoard() {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks  = [8,7,6,5,4,3,2,1];
    const checkSq = this.getCheckSquare();

    this.board = ranks.map((rank, ri) =>
      files.map((file, fi) => {
        const sq    = `${file}${rank}` as Square;
        const piece = this.chess.get(sq);
        return {
          square: sq,
          piece: piece || null,
          isLight:     (ri + fi) % 2 === 0,
          isSelected:  this.selectedSquare === sq,
          isLegalMove: this.legalMoves.includes(sq),
          isLastMove:  !!(this.lastMove && (this.lastMove.from === sq || this.lastMove.to === sq)),
          isCheck:     sq === checkSq,
        };
      })
    );
  }

  getCheckSquare(): Square | null {
    if (!this.chess.inCheck()) return null;
    const turn = this.chess.turn();
    for (const r of [1,2,3,4,5,6,7,8])
      for (const f of ['a','b','c','d','e','f','g','h']) {
        const sq = `${f}${r}` as Square;
        const p  = this.chess.get(sq);
        if (p && p.type === 'k' && p.color === turn) return sq;
      }
    return null;
  }

  get displayBoard(): Cell[][] {
    const b = [...this.board].reverse().map(r => [...r].reverse());
    return this.isFlipped ? b : this.board;
  }

  get displayFiles(): string[] {
    const f = ['a','b','c','d','e','f','g','h'];
    return this.isFlipped ? [...f].reverse() : f;
  }

  get displayRanks(): number[] {
    const r = [8,7,6,5,4,3,2,1];
    return this.isFlipped ? [...r].reverse() : r;
  }

  pieceSymbol(piece: Piece): string {
    return this.PIECES[`${piece.color}${piece.type.toUpperCase()}`] || '';
  }

  // ---- Move handling ----

  clickSquare(cell: Cell) {
    if (!this.game || this.game.status !== 'active' || this.movePending) return;

    const sq = cell.square;
    if (this.selectedSquare) {
      if (this.legalMoves.includes(sq)) {
        this.submitMove(this.selectedSquare, sq);
      } else {
        const p = this.chess.get(sq);
        if (p && p.color === this.chess.turn()) { this.selectSquare(sq); }
        else { this.clearSelection(); }
      }
    } else {
      const p = this.chess.get(sq);
      if (p && p.color === this.chess.turn()) this.selectSquare(sq);
    }
  }

  private selectSquare(sq: Square) {
    this.selectedSquare = sq;
    this.legalMoves     = this.chess.moves({ square: sq, verbose: true }).map((m: any) => m.to as Square);
    this.renderBoard();
  }

  private clearSelection() {
    this.selectedSquare = null;
    this.legalMoves     = [];
    this.renderBoard();
  }

  private submitMove(from: Square, to: Square) {
    const move = this.chess.move({ from, to, promotion: 'q' });
    if (!move) return;

    this.lastMove     = { from, to };
    this.movePending  = true;
    this.clearSelection();

    this.gameService.makeMove(this.gameId, move.san).subscribe({
      next: updatedState => {
        this.chess.load(updatedState.fen);
        this.game = { ...this.game!, ...updatedState };
        this.moveHistory = updatedState.pgn ? updatedState.pgn.split(' ').filter(Boolean) : [];
        this.movePending = false;
        this.updateStatus();
        this.renderBoard();
        this.lastMoveFlash = true;
        setTimeout(() => this.lastMoveFlash = false, 600);

        // Auto-explain if coach is open
        if (this.coachOpen) this.explainLastMove(move.san, updatedState.fen);

        // Fire-and-forget commentary fetch
        if (this.commentaryEnabled) {
          this.fetchCommentary(move.san, this.moveHistory.length);
        }
      },
      error: () => {
        this.chess.undo();
        this.movePending = false;
        this.renderBoard();
      }
    });
  }

  // ---- Resign ----

  tryResign() { this.resignConfirm = true; }
  cancelResign() { this.resignConfirm = false; }

  confirmResign() {
    this.resignConfirm = false;
    this.gameService.resign(this.gameId).subscribe({
      next: res => {
        this.game = { ...this.game!, status: 'resigned', winner: res.winner, loser: res.loser };
        this.updateStatus();
      },
      error: () => {}
    });
  }

  // ---- AI Coach ----

  toggleCoach() { this.coachOpen = !this.coachOpen; }

  getHint() {
    if (!this.game || this.hintLoading) return;
    this.hintLoading  = true;
    this.hintResult   = null;
    this.aiError      = '';
    this.coachOpen    = true;
    this.aiCoach.getHint(this.game.fen, this.selectedLang).subscribe({
      next: r  => { this.hintResult = r; this.hintLoading = false; },
      error: e => {
        this.aiError     = e?.error?.detail || 'Rate limit reached';
        this.hintLoading = false;
      }
    });
  }

  explainLastMove(san?: string, fen?: string) {
    if (!this.game || this.explainLoading) return;
    const moveSan = san || this.moveHistory.at(-1) || '';
    const fenStr  = fen  || this.game.fen;
    if (!moveSan) return;

    this.explainLoading   = true;
    this.explainResult    = '';
    this.lastExplainedMove = moveSan;
    this.coachOpen        = true;
    this.aiError          = '';

    this.aiCoach.explainMove(fenStr, moveSan, this.selectedLang).subscribe({
      next: r  => { this.explainResult = r.explanation; this.explainLoading = false; },
      error: e => {
        this.aiError        = e?.error?.detail || 'Rate limit reached';
        this.explainLoading = false;
      }
    });
  }

  // ---- Helpers ----

  get isMyTurn(): boolean {
    if (!this.game || !this.myColor) return false;
    return this.game.turn === this.myColor;
  }

  get isGameOver(): boolean {
    return !!this.game && this.game.status !== 'active';
  }

  get movePairs(): string[][] {
    const pairs: string[][] = [];
    for (let i = 0; i < this.moveHistory.length; i += 2) {
      pairs.push([this.moveHistory[i], this.moveHistory[i+1] || '']);
    }
    return pairs;
  }

  flipBoard() { this.isFlipped = !this.isFlipped; }

  // ---- Commentary ----

  toggleCommentary() { this.commentaryEnabled = !this.commentaryEnabled; }

  getGamePhase(): 'opening' | 'middlegame' | 'endgame' {
    if (this.moveHistory.length < 10) return 'opening';
    if (this.moveHistory.length > 40) return 'endgame';
    return 'middlegame';
  }

  fetchCommentary(moveSan: string, moveNumber: number) {
    if (!this.game) return;
    this.commentaryLoading = true;
    this.commentary = '';
    this.api.post<{ commentary: string }>('/commentary/move', {
      fen: this.chess.fen(),
      move_san: moveSan,
      move_number: moveNumber,
      game_phase: this.getGamePhase(),
      lang: this.selectedLang === 'english' ? 'en' : this.selectedLang === 'hindi' ? 'hi' : 'or'
    }).subscribe({
      next: res => {
        this.commentary = res.commentary || '';
        this.commentaryLoading = false;
        this.speak(this.commentary);
      },
      error: () => {
        this.commentaryLoading = false;
      }
    });
  }
}
