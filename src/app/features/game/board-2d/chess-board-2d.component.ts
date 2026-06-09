import {
  Component, Input, Output, EventEmitter,
  OnInit, OnChanges, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Square } from 'chess.js';

const UNICODE: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

interface Cell {
  sq: Square;
  pieceKey: string | null;   // e.g. "wK", "bP"
  isLight: boolean;
}

@Component({
  selector: 'app-chess-board-2d',
  standalone: true,
  imports: [CommonModule],
  template: `
<div class="board-wrap">

  <!-- Rank labels left -->
  <div class="rank-labels">
    <span *ngFor="let r of ranks" class="rl">{{ r }}</span>
  </div>

  <!-- Board grid -->
  <div class="grid-col">
    <div class="board">
      <div class="cell"
           *ngFor="let cell of flat; trackBy: trackSq"
           [class.light]="cell.isLight"
           [class.dark]="!cell.isLight"
           [class.sel]="isSel(cell.sq)"
           [class.last]="isLast(cell.sq)"
           [class.chk]="isChk(cell.sq)"
           (click)="squareClick.emit(cell.sq)">

        <!-- Legal move dot or capture ring -->
        <div class="dot"     *ngIf="isDot(cell.sq)"></div>
        <div class="cap-dot" *ngIf="isCap(cell.sq)"></div>

        <!-- Piece -->
        <div class="piece" *ngIf="cell.pieceKey">
          <img *ngIf="!failed(cell.pieceKey)"
               [src]="'assets/pieces/' + cell.pieceKey + '.svg'"
               [alt]="cell.pieceKey"
               draggable="false"
               (error)="onErr(cell.pieceKey!)">
          <span *ngIf="failed(cell.pieceKey)"
                [class.wp]="cell.pieceKey[0]==='w'"
                [class.bp]="cell.pieceKey[0]==='b'">{{ uni(cell.pieceKey) }}</span>
        </div>

      </div>
    </div>

    <!-- File labels below -->
    <div class="file-labels">
      <span *ngFor="let f of files" class="fl">{{ f }}</span>
    </div>
  </div>

</div>
  `,
  styles: [`
    :host { display: block; }

    /* ── Outer wrap ── */
    .board-wrap {
      display: flex;
      align-items: flex-start;
      gap: 0;
      user-select: none;
    }

    /* Rank labels */
    .rank-labels {
      display: flex;
      flex-direction: column;
      padding-top: 0;
    }
    .rl {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.45);
      font-family: monospace;
    }

    /* File labels */
    .file-labels {
      display: flex;
      margin-top: 2px;
    }
    .fl {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.45);
      font-family: monospace;
    }

    .grid-col { display: flex; flex-direction: column; }

    /* ── Board grid ── */
    .board {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      grid-template-rows:    repeat(8, 1fr);
      border: 2px solid #8b6914;
      box-shadow:
        0 0 0 4px #1a1208,
        0 12px 40px rgba(0,0,0,0.7),
        0 0 0 6px rgba(201,168,76,0.18);
    }

    /* ── Cell ── */
    .cell {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: filter 0.1s;
    }
    .cell:hover { filter: brightness(1.12); }

    /* Standard chess.com colours — respect CSS custom properties for theme support */
    .cell.light { background: var(--board-light, #f0d9b5); }
    .cell.dark  { background: var(--board-dark, #b58863); }

    /* Selected */
    .cell.sel.light { background: #f6f669 !important; }
    .cell.sel.dark  { background: #baca2b !important; }

    /* Last move */
    .cell.last.light { background: #cdd26a !important; }
    .cell.last.dark  { background: #aaa23a !important; }

    /* Check */
    .cell.chk { background: radial-gradient(ellipse at center, #ff0000 0%, #b30000 100%) !important; }

    /* Legal move dot (empty square) */
    .dot {
      position: absolute;
      width: 30%;
      height: 30%;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.22);
      pointer-events: none;
      z-index: 2;
    }

    /* Capture ring (occupied square) */
    .cap-dot {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 8% solid rgba(0, 0, 0, 0.22);
      pointer-events: none;
      z-index: 2;
    }

    /* ── Pieces ── */
    .piece {
      position: relative;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 86%;
      height: 86%;
      pointer-events: none;
    }

    .piece img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      -webkit-user-drag: none;
      filter: drop-shadow(1px 2px 3px rgba(0,0,0,0.5));
    }

    /* Unicode fallback */
    .piece span {
      line-height: 1;
      font-size: 72%;
    }
    .piece span.wp {
      color: #fff8f0;
      text-shadow: 0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.6);
    }
    .piece span.bp {
      color: #1a1018;
      text-shadow: 0 1px 2px rgba(255,255,255,0.15);
    }
  `]
})
export class ChessBoard2dComponent implements OnInit, OnChanges {
  @Input() fen           = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  @Input() selectedSquare: Square | null = null;
  @Input() legalMoves: Square[]          = [];
  @Input() lastMove: { from: Square; to: Square } | null = null;
  @Input() isFlipped     = false;
  @Input() checkSquare: Square | null    = null;

  @Output() squareClick = new EventEmitter<Square>();

  flat:  Cell[] = [];
  ranks: (number | string)[] = [];
  files: string[] = [];

  private chess      = new Chess();
  private failedSet  = new Set<string>();

  ngOnInit()                    { this.build(); }
  ngOnChanges(c: SimpleChanges) { if (c['fen'] || c['isFlipped']) this.build(); }

  trackSq(_: number, cell: Cell) { return cell.sq; }

  private build() {
    try { this.chess.load(this.fen); } catch { /**/ }
    const raw    = this.chess.board();
    const rowIdx = this.isFlipped ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
    const colIdx = this.isFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

    this.ranks = rowIdx.map(ri => 8 - ri);
    this.files = colIdx.map(fi => String.fromCharCode(97 + fi));

    const cells: Cell[] = [];
    for (const ri of rowIdx) {
      for (const fi of colIdx) {
        const p    = raw[ri][fi];
        const rank = 8 - ri;
        const sq   = `${String.fromCharCode(97 + fi)}${rank}` as Square;
        cells.push({
          sq,
          pieceKey: p ? `${p.color}${p.type.toUpperCase()}` : null,
          isLight:  (fi + rank) % 2 === 1,
        });
      }
    }
    this.flat = cells;
  }

  isSel(sq: Square)  { return this.selectedSquare === sq; }
  isDot(sq: Square)  { return this.legalMoves.includes(sq) && !this.flat.find(c => c.sq === sq)?.pieceKey; }
  isCap(sq: Square)  { return this.legalMoves.includes(sq) &&  !!this.flat.find(c => c.sq === sq)?.pieceKey; }
  isLast(sq: Square) { return this.lastMove?.from === sq || this.lastMove?.to === sq; }
  isChk(sq: Square)  { return this.checkSquare === sq; }

  uni(key: string)    { return UNICODE[key] ?? '?'; }
  failed(key: string) { return this.failedSet.has(key); }

  onErr(key: string) {
    this.failedSet.add(key);
  }
}
