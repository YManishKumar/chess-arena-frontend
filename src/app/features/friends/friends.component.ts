import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FriendsService, Friendship } from '../../core/services/friends.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss']
})
export class FriendsComponent implements OnInit {
  currentEmail = '';
  addEmail = '';
  addLoading = false;
  addError = '';
  addSuccess = '';
  pageLoading = true;

  accepted: Friendship[] = [];
  pendingReceived: Friendship[] = [];  // requests sent TO me
  pendingSent: Friendship[] = [];      // requests I sent

  constructor(private friendsService: FriendsService, auth: AuthService) {
    this.currentEmail = auth.getEmail();
  }

  ngOnInit() {
    this.load();
  }

  load() {
    if (!this.currentEmail) return;
    this.pageLoading = true;
    this.friendsService.getFriends(this.currentEmail).subscribe({
      next: (res) => {
        this.accepted = res.friends.filter(f => f.status === 'accepted');
        this.pendingReceived = res.friends.filter(
          f => f.status === 'pending' && f.receiver_email === this.currentEmail
        );
        this.pendingSent = res.friends.filter(
          f => f.status === 'pending' && f.requester_email === this.currentEmail
        );
        this.pageLoading = false;
      },
      error: () => { this.pageLoading = false; }
    });
  }

  sendRequest() {
    if (!this.addEmail.trim() || this.addLoading) return;
    this.addLoading = true;
    this.addError = '';
    this.addSuccess = '';
    this.friendsService.sendRequest(this.currentEmail, this.addEmail.trim()).subscribe({
      next: () => {
        this.addSuccess = `Friend request sent to ${this.addEmail}`;
        this.addEmail = '';
        this.addLoading = false;
        this.load();
      },
      error: (e) => {
        this.addError = e?.error?.detail || 'Failed to send request';
        this.addLoading = false;
      }
    });
  }

  accept(requesterEmail: string) {
    this.friendsService.acceptFriend(this.currentEmail, requesterEmail).subscribe({
      next: () => this.load()
    });
  }

  remove(friendEmail: string) {
    this.friendsService.removeFriend(this.currentEmail, friendEmail).subscribe({
      next: () => this.load()
    });
  }

  friendEmail(f: Friendship): string {
    return f.requester_email === this.currentEmail ? f.receiver_email : f.requester_email;
  }

  initials(email: string): string {
    return email.slice(0, 2).toUpperCase();
  }
}
