import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FriendsService, Friendship, Member } from '../../core/services/friends.service';
import { AuthService } from '../../core/services/auth.service';
import { GameService } from '../../core/services/game.service';
import { FriendChatService, ChatMessage } from '../../core/services/friend-chat.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss']
})
export class FriendsComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatMessages') chatMessagesRef!: ElementRef;

  currentEmail = '';
  myId         = '';
  tab: 'friends' | 'browse' = 'friends';

  // Friends
  addEmail  = '';
  addLoading = false;
  addError   = '';
  addSuccess = '';
  pageLoading = true;
  accepted: Friendship[]        = [];
  pendingReceived: Friendship[] = [];
  pendingSent: Friendship[]     = [];

  // Browse
  members: Member[]  = [];
  membersLoading     = false;
  membersLoaded      = false;
  memberSearch       = '';

  // Chat
  selectedEmail: string | null = null;
  messages: ChatMessage[]      = [];
  chatLoading  = false;
  chatInput    = '';
  chatSending  = false;
  friendId     = '';
  private scrollPending = false;

  // Invite
  inviteLoading: Record<string, boolean> = {};
  inviteSuccess = '';

  constructor(
    private friendsService: FriendsService,
    private auth: AuthService,
    private gameService: GameService,
    private chatService: FriendChatService,
    private api: ApiService,
    private router: Router
  ) {
    this.currentEmail = auth.getEmail();
  }

  ngOnInit() {
    this.loadFriends();
    this.resolveMyId();
  }

  ngOnDestroy() {
    this.chatService.unsubscribe();
  }

  ngAfterViewChecked() {
    if (this.scrollPending) {
      this.scrollToBottom();
      this.scrollPending = false;
    }
  }

  private scrollToBottom() {
    const el = this.chatMessagesRef?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  private resolveMyId() {
    this.api.get<{ users: any[] }>(`/users?email=${encodeURIComponent(this.currentEmail)}`).subscribe({
      next: () => {},
      error: () => {}
    });
    // Resolve userId from profiles
    this.api.get<any>(`/users/points?email=${encodeURIComponent(this.currentEmail)}`).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  setTab(t: 'friends' | 'browse') {
    this.tab = t;
    if (t === 'browse' && !this.membersLoaded) this.loadMembers();
  }

  loadFriends() {
    if (!this.currentEmail) return;
    this.pageLoading = true;
    this.friendsService.getFriends(this.currentEmail).subscribe({
      next: res => {
        this.accepted         = res.friends.filter(f => f.status === 'accepted');
        this.pendingReceived  = res.friends.filter(f => f.status === 'pending' && f.receiver_email === this.currentEmail);
        this.pendingSent      = res.friends.filter(f => f.status === 'pending' && f.requester_email === this.currentEmail);
        this.pageLoading      = false;
      },
      error: () => { this.pageLoading = false; }
    });
  }

  loadMembers() {
    this.membersLoading = true;
    this.friendsService.getAllUsers(this.currentEmail).subscribe({
      next: res => {
        this.members        = res.users;
        this.membersLoading = false;
        this.membersLoaded  = true;
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

  // ---- Friend actions ----

  sendRequest() {
    if (!this.addEmail.trim() || this.addLoading) return;
    this.addLoading = true;
    this.addError   = '';
    this.addSuccess = '';
    this.friendsService.sendRequest(this.currentEmail, this.addEmail.trim()).subscribe({
      next: () => {
        this.addSuccess = `Request sent to ${this.addEmail}`;
        this.addEmail   = '';
        this.addLoading = false;
        this.loadFriends();
        this.membersLoaded = false;
      },
      error: e => {
        this.addError   = e?.error?.detail || 'Failed to send request';
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

  // ---- Chat ----

  selectFriend(email: string, _friendship: Friendship | null) {
    if (this.selectedEmail === email) return;
    this.selectedEmail = email;
    this.messages      = [];
    this.chatInput     = '';
    this.chatLoading   = true;
    this.chatService.unsubscribe();

    this.chatService.loadMessages(email).subscribe({
      next: msgs => {
        this.messages    = msgs;
        this.chatLoading = false;
        this.scrollPending = true;

        // Subscribe to realtime updates — use placeholder IDs since we store UUIDs in DB
        // We'll filter by email match in the service
        this.chatService.subscribeToMessages(
          this.currentEmail,
          email,
          (msg: ChatMessage) => {
            this.messages.push(msg);
            this.scrollPending = true;
          }
        );
      },
      error: () => { this.chatLoading = false; }
    });
  }

  sendChatMessage() {
    if (!this.chatInput.trim() || this.chatSending || !this.selectedEmail) return;
    const content    = this.chatInput.trim();
    this.chatInput   = '';
    this.chatSending = true;

    this.chatService.sendMessage(this.selectedEmail, content).subscribe({
      next: msg => {
        this.messages.push(msg);
        this.chatSending   = false;
        this.scrollPending = true;
      },
      error: () => { this.chatSending = false; }
    });
  }

  formatTime(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ---- Game invite ----

  inviteToGame(toEmail: string) {
    this.inviteLoading[toEmail] = true;
    this.inviteSuccess = '';
    this.gameService.sendInvite(toEmail).subscribe({
      next: () => {
        this.inviteLoading[toEmail] = false;
        this.inviteSuccess = `Invite sent to ${toEmail}!`;
        setTimeout(() => this.inviteSuccess = '', 4000);
      },
      error: e => {
        this.inviteLoading[toEmail] = false;
        this.addError = e?.error?.detail || 'Failed to send invite';
        setTimeout(() => this.addError = '', 3000);
      }
    });
  }
}
