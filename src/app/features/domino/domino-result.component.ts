import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-domino-result',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './domino-result.component.html',
  styleUrls: ['./domino-result.component.scss']
})
export class DominoResultComponent implements OnInit {
  private router = inject(Router);

  ranks: { id: string; rank: number; score: number }[] = [];
  players: { id: string; name: string }[] = [];
  won = false;
  bet = 500;
  coinsDelta = 0;
  newBalance = 0;

  ngOnInit() {
    const nav = history.state;
    this.ranks = nav?.ranks ?? [];
    this.players = nav?.players ?? [];
    this.won = nav?.won ?? false;
    this.bet = nav?.bet ?? 500;
    this.coinsDelta = nav?.coinsDelta ?? 0;
    this.newBalance = nav?.newBalance ?? 0;
  }

  getName(id: string): string {
    return this.players.find(p => p.id === id)?.name ?? id;
  }

  getRankEmoji(rank: number): string {
    return ['🥇','🥈','🥉','4️⃣'][rank - 1] ?? String(rank);
  }

  playAgain() {
    this.router.navigate(['/domino/game'], {
      state: { bet: this.bet, userId: history.state?.userId }
    });
  }

  goLobby() { this.router.navigate(['/domino']); }
}
