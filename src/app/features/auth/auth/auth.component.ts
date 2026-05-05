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
  tab: 'login' | 'signup' = 'login';

  // Signup fields
  signupName     = '';
  signupEmail    = '';
  signupPassword = '';
  signupConfirm  = '';
  signupPhone    = '';

  // Login fields
  loginEmail    = '';
  loginPassword = '';

  loading = false;
  error   = '';
  success = '';

  // Magic link sub-flow
  magicStep: 'hidden' | 'input' | 'sent' = 'hidden';
  magicEmail = '';

  constructor(private auth: AuthService, private router: Router) {}

  switchTab(t: 'login' | 'signup') {
    this.tab = t;
    this.error = '';
    this.success = '';
    this.magicStep = 'hidden';
  }

  // ─── Sign Up ────────────────────────────────────────────────────────────────

  doSignup() {
    this.error = '';
    if (!this.signupName.trim() || !this.signupEmail.trim() || !this.signupPassword.trim()) {
      this.error = 'Name, email and password are required'; return;
    }
    if (this.signupPassword.length < 6) {
      this.error = 'Password must be at least 6 characters'; return;
    }
    if (this.signupPassword !== this.signupConfirm) {
      this.error = 'Passwords do not match'; return;
    }
    this.loading = true;
    this.auth.signup(this.signupName, this.signupEmail, this.signupPassword, this.signupPhone).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (e: any) => {
        this.error = e?.error?.detail || 'Signup failed';
        this.loading = false;
      }
    });
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  doLogin() {
    this.error = '';
    if (!this.loginEmail.trim() || !this.loginPassword.trim()) {
      this.error = 'Email and password are required'; return;
    }
    this.loading = true;
    this.auth.login(this.loginEmail, this.loginPassword).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/dashboard']); },
      error: (e: any) => {
        this.error = e?.error?.detail || 'Invalid email or password';
        this.loading = false;
      }
    });
  }

  // ─── Magic Link ─────────────────────────────────────────────────────────────

  showMagicLink() {
    this.magicStep = 'input';
    this.magicEmail = this.loginEmail;
    this.error = '';
  }

  sendMagicLink() {
    if (!this.magicEmail.trim()) return;
    this.loading = true;
    this.error = '';
    this.auth.sendOtp(this.magicEmail).subscribe({
      next: () => { this.magicStep = 'sent'; this.loading = false; },
      error: (e: any) => {
        this.error = e?.error?.detail || 'Failed to send magic link';
        this.loading = false;
      }
    });
  }

  hideMagicLink() {
    this.magicStep = 'hidden';
    this.error = '';
  }
}
