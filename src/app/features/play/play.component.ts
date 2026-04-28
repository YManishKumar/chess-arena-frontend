import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Square, Piece } from 'chess.js';

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

  board: Cell[][] = [];
  moveHistory: string[] = [];
  selectedSquare: Square | null = null;
  legalMoves: Square[] = [];
  lastMove: { from: Square; to: Square } | null = null;
  isFlipped = false;
  playerColor: 'w' | 'b' = 'w';
  gameStatus = '';

  readonly PIECES: Record<string, string> = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟',
  };

  ngOnInit() {
    this.renderBoard();
    this.updateStatus();
  }

  renderBoard() {
    const files = ['a','b','c','d','e','f','g','h'];
    const ranks = [8,7,6,5,4,3,2,1];
    const checkSquare = this.getCheckSquare();

    this.board = ranks.map((rank, ri) =>
      files.map((file, fi) => {
        const square = `${file}${rank}` as Square;
        const piece = this.chess.get(square);
        return {
          square,
          piece: piece || null,
          isLight: (ri + fi) % 2 === 0,
          isSelected: this.selectedSquare === square,
          isLegalMove: this.legalMoves.includes(square),
          isLastMove: !!(this.lastMove && (this.lastMove.from === square || this.lastMove.to === square)),
          isCheck: square === checkSquare,
        };
      })
    );
  }

  getCheckSquare(): Square | null {
    if (!this.chess.inCheck()) return null;
    const turn = this.chess.turn();
    for (const rank of [1,2,3,4,5,6,7,8]) {
      for (const file of ['a','b','c','d','e','f','g','h']) {
        const sq = `${file}${rank}` as Square;
        const p = this.chess.get(sq);
        if (p && p.type === 'k' && p.color === turn) return sq;
      }
    }
    return null;
  }

  clickSquare(square: Square) {
    if (this.chess.isGameOver()) return;

    if (this.selectedSquare) {
      if (this.legalMoves.includes(square)) {
        this.makeMove(this.selectedSquare, square);
      } else {
        const piece = this.chess.get(square);
        if (piece && piece.color === this.chess.turn()) {
          this.selectSquare(square);
        } else {
          this.clearSelection();
        }
      }
    } else {
      const piece = this.chess.get(square);
      if (piece && piece.color === this.chess.turn()) {
        this.selectSquare(square);
      }
    }
  }

  selectSquare(square: Square) {
    this.selectedSquare = square;
    this.legalMoves = this.chess.moves({ square, verbose: true }).map((m: any) => m.to as Square);
    this.renderBoard();
  }

  clearSelection() {
    this.selectedSquare = null;
    this.legalMoves = [];
    this.renderBoard();
  }

  makeMove(from: Square, to: Square) {
    const move = this.chess.move({ from, to, promotion: 'q' });
    if (move) {
      this.lastMove = { from, to };
      this.moveHistory = this.chess.history();
    }
    this.selectedSquare = null;
    this.legalMoves = [];
    this.renderBoard();
    this.updateStatus();
  }

  updateStatus() {
    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
      this.gameStatus = `Checkmate! ${winner} wins`;
    } else if (this.chess.isDraw()) {
      this.gameStatus = 'Draw!';
    } else if (this.chess.inCheck()) {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} is in check!`;
    } else {
      this.gameStatus = `${this.chess.turn() === 'w' ? 'White' : 'Black'} to move`;
    }
  }

  undoMove() {
    this.chess.undo();
    this.lastMove = null;
    this.moveHistory = this.chess.history();
    this.clearSelection();
    this.updateStatus();
  }

  resetGame() {
    this.chess.reset();
    this.lastMove = null;
    this.moveHistory = [];
    this.clearSelection();
    this.updateStatus();
  }

  flipBoard() {
    this.isFlipped = !this.isFlipped;
    this.renderBoard();
  }

  playAs(color: 'w' | 'b') {
    this.playerColor = color;
    this.isFlipped = color === 'b';
    this.renderBoard();
  }

  get displayBoard(): Cell[][] {
    return this.isFlipped ? [...this.board].reverse().map(row => [...row].reverse()) : this.board;
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

  moveLabel(move: string, i: number): string {
    return i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${move}` : move;
  }

  isGameOver(): boolean {
    return this.chess.isGameOver();
  }
}
