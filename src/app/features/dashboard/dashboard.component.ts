import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { GameService, Game } from '../../core/services/game.service';
import { ApiService } from '../../core/services/api.service';

interface Stat {
  label: string;
  value: string;
  icon: string;
  color: string;
  glow: string;
  trend?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  email    = '';
  name     = '';
  initials = '';
  points   = 30;

  rank      = 'Pawn';
  rankClass = 'rank-pawn';

  gamesLoading = true;
  recentGames: Game[] = [];
  userId = '';

  stats: Stat[] = [
    { label: 'Games Played', value: '—', icon: '♟', color: '#6c63ff', glow: 'rgba(108,99,255,0.15)' },
    { label: 'Wins',         value: '—', icon: '♔', color: '#f7b731', glow: 'rgba(247,183,49,0.15)' },
    { label: 'Win Rate',     value: '—', icon: '▲', color: '#26de81', glow: 'rgba(38,222,129,0.15)' },
    { label: 'Points',       value: '—', icon: '◆', color: '#45aaf2', glow: 'rgba(69,170,242,0.15)' },
  ];

  constructor(
    private auth: AuthService,
    private gameService: GameService,
    private api: ApiService
  ) {}

  ngOnInit() {
    this.email    = this.auth.getEmail();
    this.name     = this.auth.getName();
    this.initials = this.mkInitials(this.name || this.email);
    this.loadPoints();
    this.loadGames();
  }

  private mkInitials(input: string): string {
    if (!input) return '?';
    const str = input.includes('@') ? input.split('@')[0] : input;
    const parts = str.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return str.slice(0, 2).toUpperCase();
  }

  private loadPoints() {
    this.api.get<{ points: number }>(`/users/points?email=${encodeURIComponent(this.email)}`).subscribe({
      next: r => {
        this.points = r.points;
        this.updateRank(r.points);
        this.stats[3].value = String(r.points);
      },
      error: () => {}
    });
  }

  private loadGames() {
    this.gamesLoading = true;
    this.gameService.getHistory().subscribe({
      next: games => {
        this.recentGames   = games.slice(0, 5);
        this.gamesLoading  = false;
        this.computeStats(games);
        this.resolveUserId(games);
      },
      error: () => { this.gamesLoading = false; }
    });
  }

  private resolveUserId(games: Game[]) {
    this.api.get<{ users: any[] }>(`/users?email=${encodeURIComponent(this.email)}`).subscribe({
      next: () => {},
      error: () => {}
    });
    this.api.get<{ points: number }>(`/users/points?email=${encodeURIComponent(this.email)}`).subscribe({
      next: () => {},
      error: () => {}
    });
    const g = games[0];
    if (g) {
      this.api.get<any>(`/users?email=${encodeURIComponent(this.email)}`).subscribe({ next: () => {}, error: () => {} });
    }
  }

  private computeStats(games: Game[]) {
    const played = games.length;
    const wins   = games.filter(g => g.status === 'checkmate' && g.winner).length;
    const rate   = played ? Math.round((wins / played) * 100) : 0;
    this.stats[0].value = String(played);
    this.stats[1].value = String(wins);
    this.stats[2].value = `${rate}%`;
    if (rate >= 60) this.stats[2].trend = '↑ Hot streak';
    else if (played > 0) this.stats[2].trend = `${played} games`;
  }

  private updateRank(pts: number) {
    if (pts >= 200)      { this.rank = 'Grand Master'; this.rankClass = 'rank-gm'; }
    else if (pts >= 120) { this.rank = 'Master';        this.rankClass = 'rank-master'; }
    else if (pts >= 80)  { this.rank = 'Knight';        this.rankClass = 'rank-knight'; }
    else if (pts >= 50)  { this.rank = 'Rook';          this.rankClass = 'rank-rook'; }
    else                 { this.rank = 'Pawn';           this.rankClass = 'rank-pawn'; }
  }

  getGameResult(g: Game): string {
    if (g.status === 'active') return 'result-active';
    if (g.status === 'draw')   return 'result-draw';
    if (!g.winner)             return 'result-draw';
    return 'result-win';
  }

  getGameResultLabel(g: Game): string {
    if (g.status === 'active') return 'Live';
    if (g.status === 'draw')   return 'Draw';
    return g.status === 'resigned' ? 'Resigned' : (g.status === 'checkmate' ? 'Checkmate' : g.status);
  }

  getOpponent(g: Game): string {
    return g.white_player === g.black_player ? 'Unknown' : 'Friend';
  }

  formatStatus(s: string): string {
    return { active: 'Live', checkmate: 'Checkmate', draw: 'Draw', resigned: 'Resigned', timeout: 'Timeout' }[s] || s;
  }

  formatDate(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
