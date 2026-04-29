import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Square, Piece } from 'chess.js';
import { AiCoachService, HintResponse } from '../../core/services/ai-coach.service';
import { AuthService } from '../../core/services/auth.service';

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
  imports: [CommonModule],
  templateUrl: './play.component.html',
  styleUrls: ['./play.component.scss']
})
export class PlayComponent implements OnInit {
  private chess = new Chess();

  board: Cell[][]    = [];
  moveHistory: string[] = [];
  selectedSquare: Square | null = null;
  legalMoves: Square[]          = [];
  lastMove: { from: Square; to: Square } | null = null;
  isFlipped    = false;
  playerColor: 'w' | 'b' = 'w';
  gameStatus   = '';

  // AI Opponent
  aiMode      = false;
  aiThinking  = false;
  aiLastMove  = '';

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

  constructor(private aiCoach: AiCoachService, private auth: AuthService) {}

  ngOnInit() {
    this.renderBoard();
    this.updateStatus();
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
    this.lastMove       = { from, to };
    this.moveHistory    = this.chess.history();
    this.selectedSquare = null;
    this.legalMoves     = [];
    this.hintResult     = null;
    this.explainResult  = '';
    this.aiError        = '';
    this.renderBoard();
    this.updateStatus();

    if (this.aiMode && !this.chess.isGameOver()) {
      this.triggerAiMove();
    }
  }

  triggerAiMove() {
    this.aiThinking = true;
    this.aiLastMove = '';
    this.aiCoach.getHint(this.chess.fen(), this.selectedLang).subscribe({
      next: r => {
        this.applyAiMove(r.best_move);
      },
      error: () => {
        this.applyRandomMove();
      }
    });
  }

  private applyAiMove(san: string) {
    try {
      const m = this.chess.move(san);
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
