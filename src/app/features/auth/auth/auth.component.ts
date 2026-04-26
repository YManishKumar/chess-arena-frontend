import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss']
})
export class AuthComponent {
  phone = '';
  otp = '';
  step: 'phone' | 'otp' = 'phone';
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  sendOtp() {
    if (!this.phone.trim()) return;
    this.loading = true;
    this.error = '';
    this.auth.sendOtp(this.phone).subscribe({
      next: () => { this.step = 'otp'; this.loading = false; },
      error: (e: any) => { this.error = e?.error?.detail || 'Failed to send OTP'; this.loading = false; }
    });
  }

  verify() {
    if (!this.otp.trim()) return;
    this.loading = true;
    this.error = '';
    this.auth.verifyOtp(this.phone, this.otp).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/chat']); },
      error: (e: any) => { this.error = e?.error?.detail || 'Invalid OTP'; this.loading = false; }
    });
  }

  back() {
    this.step = 'phone';
    this.otp = '';
    this.error = '';
  }
}
