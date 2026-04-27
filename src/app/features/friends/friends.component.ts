import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FriendsService, Friendship, Member } from '../../core/services/friends.service';
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
  tab: 'friends' | 'browse' = 'friends';

  // Friends tab
  addEmail = '';
  addLoading = false;
  addError = '';
  addSuccess = '';
  pageLoading = true;
  accepted: Friendship[] = [];
  pendingReceived: Friendship[] = [];
  pendingSent: Friendship[] = [];

  // Browse tab
  members: Member[] = [];
  membersLoading = false;
  membersLoaded = false;
  memberSearch = '';

  constructor(private friendsService: FriendsService, auth: AuthService) {
    this.currentEmail = auth.getEmail();
  }

  ngOnInit() {
    this.loadFriends();
  }

  setTab(t: 'friends' | 'browse') {
    this.tab = t;
    if (t === 'browse' && !this.membersLoaded) {
      this.loadMembers();
    }
  }

  loadFriends() {
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

  loadMembers() {
    this.membersLoading = true;
    this.friendsService.getAllUsers(this.currentEmail).subscribe({
      next: (res) => {
        this.members = res.users;
        this.membersLoading = false;
        this.membersLoaded = true;
      },
      error: () => { this.membersLoading = false; }
    });
  }

  get filteredMembers(): Member[] {
    const q = this.memberSearch.toLowerCase().trim();
    if (!q) return this.members;
    return this.members.filter(m =>
      m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }

  sendRequest() {
    if (!this.addEmail.trim() || this.addLoading) return;
    this.addLoading = true;
    this.addError = '';
    this.addSuccess = '';
    this.friendsService.sendRequest(this.currentEmail, this.addEmail.trim()).subscribe({
      next: () => {
        this.addSuccess = `Request sent to ${this.addEmail}`;
        this.addEmail = '';
        this.addLoading = false;
        this.loadFriends();
        this.membersLoaded = false;
      },
      error: (e) => {
        this.addError = e?.error?.detail || 'Failed to send request';
        this.addLoading = false;
      }
    });
  }

  sendRequestTo(email: string) {
    this.friendsService.sendRequest(this.currentEmail, email).subscribe({
      next: () => {
        this.updateMemberStatus(email, 'pending_sent');
        this.loadFriends();
      },
      error: () => {}
    });
  }

  acceptFromBrowse(email: string) {
    this.friendsService.acceptFriend(this.currentEmail, email).subscribe({
      next: () => {
        this.updateMemberStatus(email, 'accepted');
        this.loadFriends();
      }
    });
  }

  cancelOrRemove(email: string) {
    this.friendsService.removeFriend(this.currentEmail, email).subscribe({
      next: () => {
        this.updateMemberStatus(email, 'none');
        this.loadFriends();
      }
    });
  }

  private updateMemberStatus(email: string, status: Member['friendship_status']) {
    const m = this.members.find(x => x.email === email);
    if (m) m.friendship_status = status;
  }

  accept(requesterEmail: string) {
    this.friendsService.acceptFriend(this.currentEmail, requesterEmail).subscribe({
      next: () => this.loadFriends()
    });
  }

  remove(friendEmail: string) {
    this.friendsService.removeFriend(this.currentEmail, friendEmail).subscribe({
      next: () => this.loadFriends()
    });
  }

  friendEmail(f: Friendship): string {
    return f.requester_email === this.currentEmail ? f.receiver_email : f.requester_email;
  }

  initials(input: string): string {
    if (!input) return '?';
    const name = input.includes('@') ? input.split('@')[0] : input;
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
}
