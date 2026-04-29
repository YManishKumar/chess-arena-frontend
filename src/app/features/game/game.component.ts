import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Chess, Square, Piece } from 'chess.js';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../core/services/auth.service';
import { GameService, Game } from '../../core/services/game.service';
import { AiCoachService, HintResponse } from '../../core/services/ai-coach.service';
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
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, RouterLink],
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

  // AI Coach
  hintLoading    = false;
  explainLoading = false;
  hintResult: HintResponse | null = null;
  explainResult  = '';
  coachOpen      = false;
  lastExplainedMove = '';
  aiError        = '';

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
  }

  ngOnDestroy() {
    if (this.gameChannel) this.gameService['sb'].removeChannel(this.gameChannel);
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
    if (s === 'checkmate')  { this.gameStatus = `Checkmate — ${this.chess.turn() === 'w' ? 'Black' : 'White'} wins!`; return; }
    if (s === 'draw')       { this.gameStatus = 'Game drawn'; return; }
    if (s === 'resigned')   { this.gameStatus = 'Game resigned'; return; }
    if (this.chess.inCheck()) {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} is in check!`;
    } else {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} to move`;
    }
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
    this.aiCoach.getHint(this.game.fen).subscribe({
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

    this.aiCoach.explainMove(fenStr, moveSan).subscribe({
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
}
