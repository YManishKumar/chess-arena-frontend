import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  phone: string;

  stats = [
    { label: 'Games Played', value: '0', icon: '&#9823;' },
    { label: 'Wins', value: '0', icon: '&#127942;' },
    { label: 'Win Rate', value: '0%', icon: '&#128200;' },
    { label: 'AI Chats', value: '0', icon: '&#129302;' },
  ];

  constructor(private auth: AuthService) {
    this.phone = auth.getPhone();
  }

  logout() {
    this.auth.logout();
  }
}
