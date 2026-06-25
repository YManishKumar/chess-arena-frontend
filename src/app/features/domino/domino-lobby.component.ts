import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Seat { id: string; name: string; is_bot: boolean; }

@Component({
  selector: 'app-domino-lobby',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './domino-lobby.component.html',
  styleUrls: ['./domino-lobby.component.scss']
})
export class DominoLobbyComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  code = '';
  room: any = null;
  error = '';
  starting = false;
  private pollTimer: any;

  get userId() { return this.auth.getEmail() || ''; }
  get isHost() { return this.room?.host_id === this.userId; }
  get seats(): Seat[] { return this.room?.seats || []; }
  get canStart() { return this.isHost && this.seats.length >= 1 && !this.starting; }
  get humanSeats() { return this.seats.filter(s => !s.is_bot); }
  get emptySlots() { return Math.max(0, 4 - this.seats.length); }

  ngOnInit() {
    this.code = (this.route.snapshot.paramMap.get('code') || '').toUpperCase();
    this.loadRoom();
    this.pollTimer = setInterval(() => this.pollRoom(), 3000);
  }

  ngOnDestroy() { clearInterval(this.pollTimer); }

  loadRoom() {
    this.api.get<any>(`/domino/room/${this.code}`).subscribe({
      next: (room) => {
        this.room = room;
        if (room.status === 'playing') {
          clearInterval(this.pollTimer);
          this.router.navigate(['/domino/room', this.code]);
        }
      },
      error: () => { this.error = 'Room not found'; }
    });
  }

  pollRoom() { this.loadRoom(); }

  startGame() {
    if (!this.canStart) return;
    this.starting = true;
    this.api.post<any>(`/domino/room/${this.code}/start`, { host_id: this.userId }).subscribe({
      next: () => {
        this.starting = false;
        this.router.navigate(['/domino/room', this.code]);
      },
      error: (e) => {
        this.starting = false;
        this.error = e?.error?.detail || 'Failed to start';
      }
    });
  }

  copyCode() {
    navigator.clipboard.writeText(this.code).catch(() => {});
  }

  goBack() {
    clearInterval(this.pollTimer);
    this.router.navigate(['/domino']);
  }

  initials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
}
