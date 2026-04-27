import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Friendship {
  id: string;
  requester_email: string;
  receiver_email: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class FriendsService {
  private API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getFriends(email: string) {
    return this.http.get<{ friends: Friendship[] }>(`${this.API}/friends?email=${encodeURIComponent(email)}`);
  }

  sendRequest(userEmail: string, friendEmail: string) {
    return this.http.post<any>(`${this.API}/friends/request`, {
      user_email: userEmail,
      friend_email: friendEmail
    });
  }

  acceptFriend(userEmail: string, requesterEmail: string) {
    return this.http.post<any>(`${this.API}/friends/accept`, {
      user_email: userEmail,
      friend_email: requesterEmail
    });
  }

  removeFriend(userEmail: string, friendEmail: string) {
    return this.http.delete<any>(`${this.API}/friends/remove`, {
      body: { user_email: userEmail, friend_email: friendEmail }
    });
  }
}
