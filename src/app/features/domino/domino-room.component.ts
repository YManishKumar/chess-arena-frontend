import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Tile { left: number; right: number; id: string; }
interface Player { id: string; name: string; isBot: boolean; hand: Tile[]; score: number; }
interface ChainTile extends Tile { flipped: boolean; }
interface GameState {
  players: Player[];
  chain: ChainTile[];
  leftEnd: number;
  rightEnd: number;
  currentPlayerIndex: number;
  phase: string;
  winnerId: string | null;
}

@Component({
  selector: 'app-domino-room',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './domino-room.component.html',
  styleUrls: ['./domino-room.component.scss']
})
export class DominoRoomComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  code = '';
  room: any = null;
  gs: GameState | null = null;
  selectedTile: Tile | null = null;
  submitting = false;
  error = '';
  private pollTimer: any;

  get userId() { return this.auth.getEmail() || ''; }

  get myPlayer(): Player | null {
    return this.gs?.players.find(p => p.id === this.userId) ?? null;
  }

  get myIndex(): number {
    return this.gs?.players.findIndex(p => p.id === this.userId) ?? -1;
  }

  get isMyTurn(): boolean {
    if (!this.gs || this.gs.phase !== 'playing') return false;
    return this.gs.currentPlayerIndex === this.myIndex;
  }

  get currentPlayer(): Player | null {
    if (!this.gs) return null;
    return this.gs.players[this.gs.currentPlayerIndex];
  }

  get opponents(): Player[] {
    return this.gs?.players.filter(p => p.id !== this.userId) ?? [];
  }

  get topOpponent(): Player | null { return this.opponents[0] ?? null; }
  get leftOpponent(): Player | null { return this.opponents[1] ?? null; }
  get rightOpponent(): Player | null { return this.opponents[2] ?? null; }

  get validMoves(): Tile[] {
    if (!this.isMyTurn || !this.myPlayer || !this.gs) return [];
    const { leftEnd, rightEnd } = this.gs;
    if (leftEnd === -1) return this.myPlayer.hand;
    return this.myPlayer.hand.filter(t =>
      t.left === leftEnd || t.right === leftEnd ||
      t.left === rightEnd || t.right === rightEnd
    );
  }

  isValid(tile: Tile): boolean {
    return this.validMoves.some(t => t.id === tile.id);
  }

  canPass(): boolean {
    return this.isMyTurn && this.validMoves.length === 0 && !this.submitting;
  }

  ngOnInit() {
    this.code = (this.route.snapshot.paramMap.get('code') || '').toUpperCase();
    this.loadRoom();
    this.pollTimer = setInterval(() => this.pollRoom(), 2000);
  }

  ngOnDestroy() { clearInterval(this.pollTimer); }

  loadRoom() {
    this.api.get<any>(`/domino/room/${this.code}`).subscribe({
      next: (room) => {
        this.room = room;
        this.gs = room.game_state;
        if (room.status === 'finished' && this.gs?.phase === 'round_over') {
          clearInterval(this.pollTimer);
          this.navigateToResult();
        }
      },
      error: () => { this.error = 'Room not found'; }
    });
  }

  pollRoom() {
    if (this.submitting) return;
    this.loadRoom();
  }

  selectTile(tile: Tile) {
    if (!this.isValid(tile)) return;
    if (this.selectedTile?.id === tile.id) { this.selectedTile = null; return; }
    this.selectedTile = tile;
    if (!this.gs) return;
    if (this.gs.chain.length === 0) { this.doMove(tile, 'right'); return; }
    const onLeft = tile.left === this.gs.leftEnd || tile.right === this.gs.leftEnd;
    const onRight = tile.left === this.gs.rightEnd || tile.right === this.gs.rightEnd;
    if (onLeft && !onRight) { this.doMove(tile, 'left'); return; }
    if (onRight && !onLeft) { this.doMove(tile, 'right'); return; }
    // ambiguous — keep tile selected, show side chooser
  }

  playOnSide(side: 'left' | 'right') {
    if (!this.selectedTile) return;
    this.doMove(this.selectedTile, side);
  }

  doMove(tile: Tile, side: string) {
    this.selectedTile = null;
    this.submitting = true;
    this.api.post<any>(`/domino/room/${this.code}/move`, {
      user_id: this.userId,
      tile_id: tile.id,
      side,
    }).subscribe({
      next: (room) => {
        this.submitting = false;
        this.room = room;
        this.gs = room.game_state;
        if (room.status === 'finished') {
          clearInterval(this.pollTimer);
          this.navigateToResult();
        }
      },
      error: (e) => {
        this.submitting = false;
        this.error = e?.error?.detail || 'Move failed';
        setTimeout(() => this.error = '', 3000);
      }
    });
  }

  pass() {
    if (!this.canPass()) return;
    this.submitting = true;
    this.api.post<any>(`/domino/room/${this.code}/pass`, { user_id: this.userId }).subscribe({
      next: (room) => {
        this.submitting = false;
        this.room = room;
        this.gs = room.game_state;
        if (room.status === 'finished') {
          clearInterval(this.pollTimer);
          this.navigateToResult();
        }
      },
      error: (e) => {
        this.submitting = false;
        this.error = e?.error?.detail || 'Pass failed';
        setTimeout(() => this.error = '', 3000);
      }
    });
  }

  private navigateToResult() {
    if (!this.gs || !this.room) return;
    const ranks = [...this.gs.players]
      .sort((a, b) => a.score - b.score)
      .map((p, i) => ({ id: p.id, rank: i + 1, score: p.score }));
    const myRank = ranks.find(r => r.id === this.userId);
    const won = myRank?.rank === 1;
    const bet = this.room.bet;
    this.router.navigate(['/domino/result'], {
      state: {
        ranks,
        players: this.gs.players,
        won,
        bet,
        coinsDelta: won ? bet * 3 : -bet,
        newBalance: 0,
      }
    });
  }

  pipRows(n: number): number[][] {
    const patterns: Record<number, number[][]> = {
      0: [],
      1: [[0,1,0],[0,1,0],[0,1,0]],
      2: [[1,0,0],[0,0,0],[0,0,1]],
      3: [[1,0,0],[0,1,0],[0,0,1]],
      4: [[1,0,1],[0,0,0],[1,0,1]],
      5: [[1,0,1],[0,1,0],[1,0,1]],
      6: [[1,0,1],[1,0,1],[1,0,1]],
    };
    return patterns[n] ?? [];
  }

  playerIcon(player: Player): string {
    return player.isBot ? '🤖' : player.name.slice(0, 2).toUpperCase();
  }

  isTurn(player: Player): boolean {
    if (!this.gs) return false;
    return this.gs.players[this.gs.currentPlayerIndex]?.id === player.id;
  }
}
