import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HintResponse {
  best_move: string;
  analysis: string;
  explanation: string;
}

@Injectable({ providedIn: 'root' })
export class AiCoachService {
  private API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getHint(fen: string): Observable<HintResponse> {
    return this.http.post<HintResponse>(`${this.API}/ai/hint`, { fen });
  }

  explainMove(fen: string, move: string): Observable<{ explanation: string }> {
    return this.http.post<{ explanation: string }>(`${this.API}/ai/explain`, { fen, move });
  }
}
