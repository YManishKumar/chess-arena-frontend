import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

export interface GameInvite {
  id: string;
  from_user: string;
  to_user: string;
  status: string;
  created_at: string;
  from_profile?: { name: string; email: string };
}

export interface Game {
  id: string;
  white_player: string;
  black_player: string;
  fen: string;
  pgn: string;
  turn: 'white' | 'black';
  status: 'active' | 'checkmate' | 'draw' | 'resigned' | 'timeout';
  winner: string | null;
  loser: string | null;
  created_at: string;
  ended_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class GameService implements OnDestroy {
  private API = environment.apiUrl;
  private gameChannel: RealtimeChannel | null = null;
  private inviteChannel: RealtimeChannel | null = null;

  readonly gameState$ = new BehaviorSubject<Game | null>(null);
  readonly pendingInvites$ = new BehaviorSubject<GameInvite[]>([]);

  constructor(private http: HttpClient, private sb: SupabaseService) {}

  sendInvite(toEmail: string): Observable<any> {
    return this.http.post(`${this.API}/games/invite`, { to_email: toEmail });
  }

  respondInvite(inviteId: string, status: 'accepted' | 'rejected'): Observable<any> {
    return this.http.post(`${this.API}/games/respond`, { invite_id: inviteId, status });
  }

  getPendingInvites(): Observable<GameInvite[]> {
    return this.http.get<GameInvite[]>(`${this.API}/games/invites/pending`);
  }

  getGame(gameId: string): Observable<Game> {
    return this.http.get<Game>(`${this.API}/games/${gameId}`);
  }

  makeMove(gameId: string, moveSan: string): Observable<any> {
    return this.http.post(`${this.API}/games/${gameId}/move`, { move_san: moveSan });
  }

  resign(gameId: string): Observable<any> {
    return this.http.post(`${this.API}/games/${gameId}/resign`, {});
  }

  getHistory(): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.API}/games/history`);
  }

  subscribeToGame(gameId: string, onUpdate: (game: any) => void): RealtimeChannel {
    if (this.gameChannel) {
      this.sb.removeChannel(this.gameChannel);
    }
    this.gameChannel = this.sb.client
      .channel(`game-${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`
      }, payload => onUpdate(payload.new))
      .subscribe();
    return this.gameChannel;
  }

  subscribeToMoves(gameId: string, onMove: (move: any) => void): RealtimeChannel {
    const channel = this.sb.client
      .channel(`moves-${gameId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'moves',
        filter: `game_id=eq.${gameId}`
      }, payload => onMove(payload.new))
      .subscribe();
    return channel;
  }

  subscribeToInvites(userId: string, onInvite: (invite: any) => void): RealtimeChannel {
    if (this.inviteChannel) {
      this.sb.removeChannel(this.inviteChannel);
    }
    this.inviteChannel = this.sb.client
      .channel(`invites-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'game_invites',
        filter: `to_user=eq.${userId}`
      }, payload => onInvite(payload.new))
      .subscribe();
    return this.inviteChannel;
  }

  ngOnDestroy() {
    if (this.gameChannel) this.sb.removeChannel(this.gameChannel);
    if (this.inviteChannel) this.sb.removeChannel(this.inviteChannel);
  }
}
