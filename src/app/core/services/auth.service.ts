import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private API = environment.apiUrl;

  constructor(private http: HttpClient, private router: Router) {}

  sendOtp(phone: string) {
    return this.http.post<any>(`${this.API}/send-otp`, { phone });
  }

  verifyOtp(phone: string, otp: string) {
    return this.http.post<any>(`${this.API}/verify-otp`, { phone, otp }).pipe(
      tap((res: any) => {
        if (res?.data) {
          localStorage.setItem('chess_token', res.data);
          localStorage.setItem('chess_phone', phone);
        }
      })
    );
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('chess_token');
  }

  getPhone(): string {
    return localStorage.getItem('chess_phone') || '';
  }

  logout() {
    localStorage.removeItem('chess_token');
    localStorage.removeItem('chess_phone');
    this.router.navigate(['/auth']);
  }
}
