import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { GameService, GameInvite } from '../../core/services/game.service';
import { ApiService } from '../../core/services/api.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  menuOpen    = false;
  userMenuOpen = false;
  showInvites  = false;

  name     = '';
  email    = '';
  initials = '';
  points: number | null = null;

  invites: GameInvite[] = [];

  private pollInterval: any;
  private gameCreatedChannel: RealtimeChannel | null = null;

  constructor(
    private auth: AuthService,
    private gameService: GameService,
    private api: ApiService,
    private sb: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    this.name  = this.auth.getName();
    this.email = this.auth.getEmail();
    this.initials = this.getInitials(this.name || this.email);
    this.loadPoints();
    this.loadInvites();
    this.watchForGameCreated();
  }

  ngOnDestroy() {
    clearInterval(this.pollInterval);
    if (this.gameCreatedChannel) this.sb.removeChannel(this.gameCreatedChannel);
  }

  private async watchForGameCreated() {
    const userId = await this.sb.getUserId();
    if (!userId) return;
    this.gameCreatedChannel = this.gameService.subscribeToGameCreated(userId, (game: any) => {
      // Sender gets navigated to the game once receiver accepts
      this.router.navigate(['/game', game.id]);
    });
  }

  private loadPoints() {
    this.api.get<{ points: number }>(`/users/points?email=${encodeURIComponent(this.email)}`).subscribe({
      next: r => this.points = r.points,
      error: () => {}
    });
  }

  private loadInvites() {
    if (!this.auth.isLoggedIn()) return;
    this.gameService.getPendingInvites().subscribe({
      next: inv => this.invites = inv,
      error: () => {}
    });
  }

  getInitials(input: string): string {
    if (!input) return '?';
    const name = input.includes('@') ? input.split('@')[0] : input;
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  toggleMenu() { this.menuOpen = !this.menuOpen; }
  closeMenu()  { this.menuOpen = false; }

  toggleUserMenu() { this.userMenuOpen = !this.userMenuOpen; this.showInvites = false; }
  toggleInvites()  { this.showInvites = !this.showInvites; this.userMenuOpen = false; }

  closeAll() {
    this.menuOpen     = false;
    this.userMenuOpen = false;
    this.showInvites  = false;
  }

  acceptInvite(inv: GameInvite) {
    this.gameService.respondInvite(inv.id, 'accepted').subscribe({
      next: (res: any) => {
        this.invites = this.invites.filter(i => i.id !== inv.id);
        this.showInvites = false;
        if (res?.game?.id) {
          this.router.navigate(['/game', res.game.id]);
        }
      },
      error: () => {}
    });
  }

  rejectInvite(inv: GameInvite) {
    this.gameService.respondInvite(inv.id, 'rejected').subscribe({
      next: () => { this.invites = this.invites.filter(i => i.id !== inv.id); },
      error: () => {}
    });
  }

  logout() {
    this.closeAll();
    this.auth.logout();
  }
}
