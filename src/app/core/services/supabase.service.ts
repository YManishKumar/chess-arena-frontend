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
}
