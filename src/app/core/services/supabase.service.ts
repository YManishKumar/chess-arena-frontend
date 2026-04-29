import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  channel(name: string): RealtimeChannel {
    return this.client.channel(name);
  }

  removeChannel(channel: RealtimeChannel) {
    this.client.removeChannel(channel);
  }

  async getUserId(): Promise<string> {
    // Auth goes through FastAPI so the JS client has no session.
    // Extract user UUID from the JWT sub claim stored in localStorage.
    const token = localStorage.getItem('chess_token');
    if (!token) return '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub || '';
    } catch {
      return '';
    }
  }

  async getProfileId(email: string): Promise<string> {
    const { data } = await this.client.from('profiles').select('id').eq('email', email).single();
    return (data as any)?.id || '';
  }
}
