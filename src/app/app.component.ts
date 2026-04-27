import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [':host { display: block; height: 100vh; }']
})
export class AppComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit() {
    // Supabase magic link redirects to /#access_token=...
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        localStorage.setItem('chess_token', accessToken);
        const refreshToken = params.get('refresh_token');
        if (refreshToken) localStorage.setItem('chess_refresh_token', refreshToken);
        window.location.hash = '';
        this.router.navigate(['/chat']);
      }
    }
  }
}
