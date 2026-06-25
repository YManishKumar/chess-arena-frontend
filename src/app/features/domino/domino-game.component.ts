import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  initGame, getValidMoves, playTile, passMove,
  botMove, calcRanks
} from './domino.engine';
import { GameState, Tile, Side } from './domino.models';

@Component({
  selector: 'app-domino-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './domino-game.component.html',
  styleUrls: ['./domino-game.component.scss']
})
export class DominoGameComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  state!: GameState;
  bet = 500;
  userId = '';
  selectedTile: Tile | null = null;
  botThinking = false;
  private botTimer: any;

  readonly botNames = ['Bot Alpha', 'Bot Beta', 'Bot Gamma'];

  ngOnInit() {
    const nav = history.state;
    this.bet = nav?.bet ?? 500;
    this.userId = nav?.userId ?? this.auth.getEmail();
    this.state = initGame(['You', ...this.botNames]);
    this.scheduleBotIfNeeded();
  }

  ngOnDestroy() { clearTimeout(this.botTimer); }

  get human() { return this.state.players[0]; }
  get bots() { return this.state.players.slice(1); }
  get isMyTurn() { return this.state.currentPlayerIndex === 0 && this.state.phase === 'playing'; }

  get validMoves(): Tile[] {
    if (!this.isMyTurn) return [];
    return getValidMoves(this.human.hand, this.state.leftEnd, this.state.rightEnd);
  }

  isValid(tile: Tile): boolean {
    return this.validMoves.some(t => t.id === tile.id);
  }

  canPass(): boolean {
    return this.isMyTurn && this.validMoves.length === 0;
  }

  selectTile(tile: Tile) {
    if (!this.isValid(tile)) return;
    if (this.selectedTile?.id === tile.id) {
      this.selectedTile = null;
      return;
    }
    this.selectedTile = tile;
    if (this.state.chain.length === 0) {
      this.doPlay(tile, 'right');
      return;
    }
    const onLeft = tile.left === this.state.leftEnd || tile.right === this.state.leftEnd;
    const onRight = tile.left === this.state.rightEnd || tile.right === this.state.rightEnd;
    if (onLeft && !onRight) { this.doPlay(tile, 'left'); return; }
    if (onRight && !onLeft) { this.doPlay(tile, 'right'); return; }
  }

  playOnSide(side: Side) {
    if (!this.selectedTile) return;
    this.doPlay(this.selectedTile, side);
  }

  doPlay(tile: Tile, side: Side) {
    this.state = playTile(this.state, 'human', tile, side);
    this.selectedTile = null;
    if (this.state.phase === 'round_over') {
      this.finishGame();
    } else {
      this.scheduleBotIfNeeded();
    }
  }

  pass() {
    if (!this.canPass()) return;
    this.state = passMove(this.state);
    this.scheduleBotIfNeeded();
  }

  private scheduleBotIfNeeded() {
    const idx = this.state.currentPlayerIndex;
    if (idx === 0 || this.state.phase === 'round_over') return;
    this.botThinking = true;
    this.botTimer = setTimeout(() => this.runBot(), 800);
  }

  private runBot() {
    const bot = this.state.players[this.state.currentPlayerIndex];
    const move = botMove(this.state, bot.id);
    if (move) {
      this.state = playTile(this.state, bot.id, move.tile, move.side);
    } else {
      this.state = passMove(this.state);
    }
    this.botThinking = false;
    if (this.state.phase === 'round_over') {
      this.finishGame();
    } else {
      this.scheduleBotIfNeeded();
    }
  }

  private finishGame() {
    const ranks = calcRanks(this.state.players);
    const myRank = ranks.find(r => r.id === 'human')!;
    const won = myRank.rank === 1;
    this.api.post('/domino/finish', {
      user_id: this.userId,
      bet: this.bet,
      won,
      rank: myRank.rank,
      score: myRank.score,
    }).subscribe({
      next: (res: any) => {
        this.router.navigate(['/domino/result'], {
          state: {
            ranks,
            players: this.state.players,
            won,
            bet: this.bet,
            coinsDelta: res.coins_delta,
            newBalance: res.new_balance,
          }
        });
      },
      error: () => {
        this.router.navigate(['/domino/result'], {
          state: {
            ranks,
            players: this.state.players,
            won,
            bet: this.bet,
            coinsDelta: won ? this.bet * 3 : -this.bet,
            newBalance: 0,
          }
        });
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
}
