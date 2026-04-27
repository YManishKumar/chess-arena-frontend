import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private API = environment.apiUrl;

  constructor(private http: HttpClient, private router: Router) {}

  signup(name: string, email: string, password: string, phone: string) {
    return this.http.post<any>(`${this.API}/signup`, { name, email, password, phone }).pipe(
      tap((res: any) => {
        if (res?.token) this.storeSession(res.token, res.user);
      })
    );
  }

  login(email: string, password: string) {
    return this.http.post<any>(`${this.API}/login`, { email, password }).pipe(
      tap((res: any) => {
        if (res?.token) this.storeSession(res.token, res.user);
      })
    );
  }

  sendOtp(email: string) {
    return this.http.post<any>(`${this.API}/send-otp`, { email });
  }

  verifyOtp(email: string, token: string) {
    return this.http.post<any>(`${this.API}/verify-otp`, { email, token }).pipe(
      tap((res: any) => {
        if (res?.data) {
          localStorage.setItem('chess_token', res.data);
        }
      })
    );
  }

  private storeSession(token: string, user: any) {
    localStorage.setItem('chess_token', token);
    localStorage.setItem('chess_email', user?.email || '');
    localStorage.setItem('chess_name', user?.name || '');
    localStorage.setItem('chess_phone', user?.phone || '');
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('chess_token');
  }

  getEmail(): string  { return localStorage.getItem('chess_email') || ''; }
  getName(): string   { return localStorage.getItem('chess_name')  || ''; }
  getPhone(): string  { return localStorage.getItem('chess_phone') || ''; }

  logout() {
    ['chess_token', 'chess_email', 'chess_name', 'chess_phone', 'chess_refresh_token']
      .forEach(k => localStorage.removeItem(k));
    this.router.navigate(['/auth']);
  }
}
