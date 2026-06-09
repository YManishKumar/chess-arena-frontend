import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Square, Piece } from 'chess.js';
import { AiCoachService, HintResponse } from '../../core/services/ai-coach.service';
import { ChessBoard3DComponent } from '../game/board-3d/chess-board-3d.component';
import { ChessBoard2dComponent } from '../game/board-2d/chess-board-2d.component';
import { StockfishService, AIDifficulty } from '../../core/services/stockfish.service';
import { ChessSoundService } from '../../core/services/chess-sound.service';
import { ApiService } from '../../core/services/api.service';

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
  selector: 'app-play',
  standalone: true,
  imports: [CommonModule, ChessBoard3DComponent, ChessBoard2dComponent],
  templateUrl: './play.component.html',
  styleUrls: ['./play.component.scss']
})
export class PlayComponent implements OnInit, OnDestroy {
  private chess = new Chess();

  board: Cell[][]    = [];
  moveHistory: string[] = [];
  selectedSquare: Square | null = null;
  legalMoves: Square[]          = [];
  lastMove: { from: Square; to: Square } | null = null;
  isFlipped    = false;
  playerColor: 'w' | 'b' = 'w';
  gameStatus   = '';
  viewMode: '2d' | '3d' = '2d';

  toggleViewMode() { this.viewMode = this.viewMode === '2d' ? '3d' : '2d'; }

  get checkSq(): Square | null { return this.getCheckSquare(); }

  get currentFen(): string { return this.chess.fen(); }

  // AI Opponent
  aiMode      = false;
  aiThinking  = false;
  aiLastMove  = '';
  aiDifficulty: AIDifficulty = 'easy';

  readonly difficulties: { value: AIDifficulty; label: string; elo: string; icon: string }[] = [
    { value: 'beginner', label: 'Beginner', elo: '~400',  icon: '🌱' },
    { value: 'easy',     label: 'Easy',     elo: '~800',  icon: '🐣' },
    { value: 'medium',   label: 'Medium',   elo: '~1200', icon: '⚔️' },
    { value: 'hard',     label: 'Hard',     elo: '~1800', icon: '🔥' },
    { value: 'expert',   label: 'Expert',   elo: '~2400', icon: '👑' },
  ];

  // AI Coach
  hintLoading    = false;
  explainLoading = false;
  hintResult: HintResponse | null = null;
  explainResult  = '';
  lastExplainMove = '';
  aiError         = '';

  selectedLang = 'english';
  readonly langs = [
    { value: 'english', label: 'English' },
    { value: 'hindi',   label: 'हिंदी' },
    { value: 'odia',    label: 'ଓଡ଼ିଆ' },
  ];

  readonly PIECES: Record<string, string> = {
    'wK':'♔','wQ':'♕','wR':'♖','wB':'♗','wN':'♘','wP':'♙',
    'bK':'♚','bQ':'♛','bR':'♜','bB':'♝','bN':'♞','bP':'♟',
  };

  // Commentary
  commentary        = '';
  commentaryLoading = false;
  commentaryEnabled = false;
  voiceEnabled      = false;
  availableVoices: SpeechSynthesisVoice[] = [];
  selectedVoice: SpeechSynthesisVoice | null = null;
  showVoicePicker = false;

  toggleCommentary() { this.commentaryEnabled = !this.commentaryEnabled; }
  toggleVoice() { this.voiceEnabled = !this.voiceEnabled; }
  toggleVoicePicker() { this.showVoicePicker = !this.showVoicePicker; }

  private loadVoices() {
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const ALLOWED_LANGS = ['en-IN', 'hi-IN', 'or-IN', 'te-IN'];
      this.availableVoices = all.filter(v => ALLOWED_LANGS.includes(v.lang));
      if (!this.availableVoices.length) this.availableVoices = all; // fallback if no IN voices
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

  getGamePhase(): 'opening' | 'middlegame' | 'endgame' {
    if (this.moveHistory.length < 10) return 'opening';
    if (this.moveHistory.length > 40) return 'endgame';
    return 'middlegame';
  }

  fetchCommentary(moveSan: string) {
    this.commentaryLoading = true;
    this.commentary = '';
    this.api.post<{ commentary: string }>('/commentary/move', {
      fen: this.chess.fen(),
      move_san: moveSan,
      move_number: this.moveHistory.length,
      game_phase: this.getGamePhase(),
      lang: this.selectedLang === 'english' ? 'en' : this.selectedLang === 'hindi' ? 'hi' : 'or'
    }).subscribe({
      next: res => {
        this.commentary = res.commentary || '';
        this.commentaryLoading = false;
        this.speak(this.commentary);
      },
      error: () => { this.commentaryLoading = false; }
    });
  }

  constructor(
    private aiCoach: AiCoachService,
    private stockfish: StockfishService,
    private sound: ChessSoundService,
    private api: ApiService
  ) {}

  // Board themes
  themes = [
    { id: 'default',       name: 'Classic',      light: '#f0d9b5', dark: '#b58863' },
    { id: 'dark-academia', name: 'Dark Academia', light: '#d4c5a9', dark: '#5c4033' },
    { id: 'y2k',           name: 'Y2K',           light: '#ffe0f0', dark: '#cc66cc' },
    { id: 'anime',         name: 'Anime',         light: '#ffeeff', dark: '#9933cc' },
    { id: 'cottagecore',   name: 'Cottagecore',   light: '#e8f5e9', dark: '#558b2f' },
    { id: 'cyber',         name: 'Cyberpunk',     light: '#1a1a2e', dark: '#00ff9f' },
    { id: 'ocean',         name: 'Deep Ocean',    light: '#b3d9ff', dark: '#1565c0' },
  ];
  currentTheme = this.themes[0];

  readonly boardThemes = [
    { id: 'default',       label: '♟️ Classic',       light: '#f0d9b5', dark: '#b58863' },
    { id: 'dark-academia', label: '📚 Dark Academia', light: '#d4c5a9', dark: '#5c4a2a' },
    { id: 'y2k',           label: '💿 Y2K',           light: '#e8d5ff', dark: '#8b5cf6' },
    { id: 'anime',         label: '🌸 Anime',          light: '#fce4ec', dark: '#e91e8c' },
    { id: 'cottagecore',   label: '🌿 Cottagecore',   light: '#d4edda', dark: '#2d6a4f' },
  ];
  showThemePicker = false;

  toggleThemePicker() { this.showThemePicker = !this.showThemePicker; }

  setTheme(theme: any) {
    this.currentTheme = theme;
    localStorage.setItem('chess_theme', JSON.stringify(theme));
    document.documentElement.style.setProperty('--board-light', theme.light);
    document.documentElement.style.setProperty('--board-dark', theme.dark);
    this.showThemePicker = false;
  }

  ngOnInit() {
    const saved = localStorage.getItem('chess_theme');
    if (saved) { try { this.setTheme(JSON.parse(saved)); } catch {} }
    this.stockfish.init();
    this.renderBoard();
    this.updateStatus();
    this.loadVoices();
  }

  ngOnDestroy() {
    this.stockfish.destroy();
  }

  renderBoard() {
    const files  = ['a','b','c','d','e','f','g','h'];
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

  clickSquare(square: Square) {
    if (this.chess.isGameOver()) return;
    if (this.aiThinking) return;
    if (this.aiMode && this.chess.turn() !== this.playerColor) return;
    if (this.selectedSquare) {
      if (this.legalMoves.includes(square)) {
        this.makeMove(this.selectedSquare, square);
      } else {
        const p = this.chess.get(square);
        if (p && p.color === this.chess.turn()) { this.selectSquare(square); }
        else { this.clearSelection(); }
      }
    } else {
      const p = this.chess.get(square);
      if (p && p.color === this.chess.turn()) this.selectSquare(square);
    }
  }

  selectSquare(sq: Square) {
    this.selectedSquare = sq;
    this.legalMoves     = this.chess.moves({ square: sq, verbose: true }).map((m: any) => m.to as Square);
    this.renderBoard();
  }

  clearSelection() {
    this.selectedSquare = null;
    this.legalMoves     = [];
    this.renderBoard();
  }

  makeMove(from: Square, to: Square) {
    const move = this.chess.move({ from, to, promotion: 'q' });
    if (!move) return;

    // Sound feedback
    if (this.chess.isCheckmate())       this.sound.playCheckmate();
    else if (this.chess.inCheck())      this.sound.playCheck();
    else if (move.flags.includes('c') || move.flags.includes('e')) this.sound.playCapture();
    else                                this.sound.playMove();

    this.lastMove       = { from, to };
    this.moveHistory    = this.chess.history();
    this.selectedSquare = null;
    this.legalMoves     = [];
    this.hintResult     = null;
    this.explainResult  = '';
    this.aiError        = '';
    this.renderBoard();
    this.updateStatus();

    if (this.commentaryEnabled) this.fetchCommentary(move.san);

    if (this.aiMode && !this.chess.isGameOver()) {
      this.triggerAiMove();
    }
  }

  triggerAiMove() {
    this.aiThinking = true;
    this.aiLastMove = '';
    const fen = this.chess.fen();

    this.stockfish.getBestMove(fen, this.aiDifficulty).then(uciMove => {
      // UCI format: e2e4 or e7e8q (promotion)
      const from = uciMove.slice(0, 2) as Square;
      const to   = uciMove.slice(2, 4) as Square;
      const promo = uciMove.length === 5 ? uciMove[4] : undefined;
      try {
        const m = this.chess.move({ from, to, promotion: promo || 'q' });
        if (m) {
          this.lastMove    = { from: m.from as Square, to: m.to as Square };
          this.aiLastMove  = m.san;
          this.moveHistory = this.chess.history();
        } else {
          this.applyRandomMove();
          return;
        }
      } catch {
        this.applyRandomMove();
        return;
      }
      this.aiThinking = false;
      this.renderBoard();
      this.updateStatus();
    }).catch(() => {
      this.applyRandomMove();
    });
  }

  private applyRandomMove() {
    const moves = this.chess.moves({ verbose: true }) as any[];
    if (moves.length > 0) {
      const m = moves[Math.floor(Math.random() * moves.length)];
      this.chess.move(m);
      this.lastMove    = { from: m.from as Square, to: m.to as Square };
      this.aiLastMove  = m.san;
      this.moveHistory = this.chess.history();
    }
    this.aiThinking = false;
    this.renderBoard();
    this.updateStatus();
  }

  updateStatus() {
    if (this.chess.isCheckmate()) {
      this.gameStatus = `Checkmate! ${this.chess.turn() === 'w' ? 'Black' : 'White'} wins`;
    } else if (this.chess.isDraw()) {
      this.gameStatus = 'Draw!';
    } else if (this.chess.inCheck()) {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} is in check!`;
    } else {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} to move`;
    }
  }

  undoMove() {
    if (this.aiMode) {
      this.chess.undo();
      this.chess.undo();
    } else {
      this.chess.undo();
    }
    this.lastMove      = null;
    this.aiLastMove    = '';
    this.moveHistory   = this.chess.history();
    this.hintResult    = null;
    this.explainResult = '';
    this.clearSelection();
    this.updateStatus();
  }

  resetGame() {
    this.chess.reset();
    this.lastMove      = null;
    this.aiLastMove    = '';
    this.aiThinking    = false;
    this.moveHistory   = [];
    this.hintResult    = null;
    this.explainResult = '';
    this.aiError       = '';
    this.clearSelection();
    this.updateStatus();
    if (this.aiMode && this.playerColor === 'b') {
      this.triggerAiMove();
    }
  }

  toggleAiMode() {
    this.aiMode = !this.aiMode;
    this.resetGame();
  }

  setDifficulty(d: AIDifficulty) {
    this.aiDifficulty = d;
  }

  flipBoard() { this.isFlipped = !this.isFlipped; this.renderBoard(); }

  playAs(color: 'w' | 'b') {
    this.playerColor = color;
    this.isFlipped   = color === 'b';
    this.resetGame();
  }

  // ---- AI Coach ----

  getHint() {
    if (this.hintLoading || this.aiThinking || this.chess.isGameOver()) return;
    this.hintLoading  = true;
    this.hintResult   = null;
    this.explainResult = '';
    this.aiError       = '';

    this.aiCoach.getHint(this.chess.fen(), this.selectedLang).subscribe({
      next: r  => { this.hintResult = r; this.hintLoading = false; },
      error: e => {
        this.aiError     = e?.error?.detail || 'Rate limit reached (10/hr)';
        this.hintLoading = false;
      }
    });
  }

  explainLast() {
    if (this.explainLoading || this.aiThinking || this.moveHistory.length === 0) return;
    const move = this.moveHistory.at(-1) || '';
    this.explainLoading  = true;
    this.hintResult      = null;
    this.explainResult   = '';
    this.lastExplainMove = move;
    this.aiError         = '';

    this.aiCoach.explainMove(this.chess.fen(), move, this.selectedLang).subscribe({
      next: r  => { this.explainResult = r.explanation; this.explainLoading = false; },
      error: e => {
        this.aiError        = e?.error?.detail || 'Rate limit reached (10/hr)';
        this.explainLoading = false;
      }
    });
  }

  // ---- Display helpers ----

  get displayBoard(): Cell[][] {
    return this.isFlipped
      ? [...this.board].reverse().map(row => [...row].reverse())
      : this.board;
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

  isGameOver(): boolean { return this.chess.isGameOver(); }

  get movePairs(): string[][] {
    const pairs: string[][] = [];
    for (let i = 0; i < this.moveHistory.length; i += 2) {
      pairs.push([this.moveHistory[i], this.moveHistory[i+1] || '']);
    }
    return pairs;
  }
}
