import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface WrappedStats {
  total_games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
  current_streak: number;
  max_streak: number;
  total_puzzles_solved: number;
  favorite_opening: string;
  personality_type: string;
  ai_summary: string;
  best_month: string;
}

@Component({
  selector: 'app-wrapped',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './wrapped.component.html',
  styleUrls: ['./wrapped.component.scss']
})
export class WrappedComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  loading = true;
  error = '';
  stats: WrappedStats | null = null;
  copied = false;
  summaryVisible = false;

  ngOnInit(): void {
    const email = this.auth.getEmail();
    this.api.get<WrappedStats>(`/wrapped/stats?user_id=${encodeURIComponent(email)}`).subscribe({
      next: data => {
        this.stats = data;
        this.loading = false;
        // Trigger summary fade-in after a short delay
        setTimeout(() => (this.summaryVisible = true), 400);
      },
      error: () => {
        this.error = 'Could not load your Chess Wrapped stats. Try again later.';
        this.loading = false;
      }
    });
  }

  get winRateDisplay(): string {
    if (!this.stats) return '—';
    return `${Math.round(this.stats.win_rate)}%`;
  }

  get statCards(): { icon: string; label: string; value: string | number; color: string; glow: string }[] {
    if (!this.stats) return [];
    return [
      { icon: '🎮', label: 'Total Games',     value: this.stats.total_games,              color: '#6c63ff', glow: 'rgba(108,99,255,0.2)' },
      { icon: '🏆', label: 'Wins',             value: this.stats.wins,                     color: '#f7b731', glow: 'rgba(247,183,49,0.2)' },
      { icon: '💔', label: 'Losses',           value: this.stats.losses,                   color: '#fc5c65', glow: 'rgba(252,92,101,0.2)' },
      { icon: '📈', label: 'Win Rate',         value: this.winRateDisplay,                 color: '#26de81', glow: 'rgba(38,222,129,0.2)' },
      { icon: '🔥', label: 'Current Streak',   value: `${this.stats.current_streak} days`, color: '#fd9644', glow: 'rgba(253,150,68,0.2)'  },
      { icon: '🌟', label: 'Best Streak',      value: `${this.stats.max_streak} days`,     color: '#a55eea', glow: 'rgba(165,94,234,0.2)'  },
      { icon: '🧩', label: 'Puzzles Solved',   value: this.stats.total_puzzles_solved,     color: '#45aaf2', glow: 'rgba(69,170,242,0.2)'  },
    ];
  }

  copyShareText(): void {
    if (!this.stats) return;
    const text = [
      `♟️ My Chess Wrapped ♟️`,
      `🎮 Games Played: ${this.stats.total_games}`,
      `🏆 Wins: ${this.stats.wins}`,
      `📈 Win Rate: ${this.winRateDisplay}`,
      `🔥 Best Streak: ${this.stats.max_streak} days`,
      `🧩 Puzzles Solved: ${this.stats.total_puzzles_solved}`,
      `♟ Favorite Opening: ${this.stats.favorite_opening}`,
      `✨ Personality: ${this.stats.personality_type}`,
      `📅 Best Month: ${this.stats.best_month}`,
      ``,
      `#ChessArena #ChessWrapped`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2500);
    });
  }
}
