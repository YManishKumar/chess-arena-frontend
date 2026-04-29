import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class FriendChatService {
  private API = environment.apiUrl;
  private channel: RealtimeChannel | null = null;
  readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);

  constructor(private http: HttpClient, private sb: SupabaseService) {}

  loadMessages(friendEmail: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.API}/messages/${encodeURIComponent(friendEmail)}`);
  }

  sendMessage(receiverEmail: string, content: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.API}/messages/send`, {
      receiver_email: receiverEmail,
      content
    });
  }

  subscribeToMessages(myId: string, friendId: string, onMessage: (msg: ChatMessage) => void): void {
    if (this.channel) {
      this.sb.removeChannel(this.channel);
    }
    this.channel = this.sb.client
      .channel(`chat-${[myId, friendId].sort().join('-')}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, payload => {
        const msg = payload.new as ChatMessage;
        const relevant =
          (msg.sender_id === myId && msg.receiver_id === friendId) ||
          (msg.sender_id === friendId && msg.receiver_id === myId);
        if (relevant) onMessage(msg);
      })
      .subscribe();
  }

  unsubscribe() {
    if (this.channel) {
      this.sb.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
