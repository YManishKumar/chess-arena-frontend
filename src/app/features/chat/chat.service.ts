import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  sendMessage(message: string, personality: string) {
    return this.http.post<{ reply: string }>(`${this.API}/chat`, {
      message,
      personality
    });
  }
}
