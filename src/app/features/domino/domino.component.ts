import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-domino',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './domino.component.html',
  styleUrls: ['./domino.component.scss']
})
export class DominoComponent {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);

  readonly betOptions = [100, 500, 1000];
  selectedBet = 500;
  mode: 'choose' | 'solo' | 'friends' = 'choose';
  starting = false;
  error = '';
  joinCode = '';

  selectBet(bet: number) { this.selectedBet = bet; }

  startSolo() {
    const userId = this.auth.getEmail();
    if (!userId) { this.error = 'Not logged in'; return; }
    this.router.navigate(['/domino/game'], { state: { bet: this.selectedBet, userId } });
  }

  createRoom() {
    const userId = this.auth.getEmail();
    const userName = this.auth.getName() || userId || 'Player';
    if (!userId) { this.error = 'Not logged in'; return; }
    this.starting = true;
    this.error = '';
    this.api.post<any>('/domino/room', {
      host_id: userId,
      host_name: userName,
      bet: this.selectedBet,
    }).subscribe({
      next: (room) => {
        this.starting = false;
        this.router.navigate(['/domino/lobby', room.code]);
      },
      error: (e) => {
        this.starting = false;
        this.error = e?.error?.detail || 'Failed to create room';
      }
    });
  }

  joinRoom() {
    const code = this.joinCode.trim().toUpperCase();
    if (!code || code.length < 4) { this.error = 'Enter room code'; return; }
    const userId = this.auth.getEmail();
    const userName = this.auth.getName() || userId || 'Player';
    if (!userId) { this.error = 'Not logged in'; return; }
    this.starting = true;
    this.error = '';
    this.api.post<any>(`/domino/room/${code}/join`, {
      user_id: userId,
      user_name: userName,
    }).subscribe({
      next: () => {
        this.starting = false;
        this.router.navigate(['/domino/lobby', code]);
      },
      error: (e) => {
        this.starting = false;
        this.error = e?.error?.detail || 'Failed to join room';
      }
    });
  }
}
