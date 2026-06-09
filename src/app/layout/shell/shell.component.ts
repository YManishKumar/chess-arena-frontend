import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  template: `
    <div class="stars-bg"></div>
    <div class="nebula-orb orb-1"></div>
    <div class="nebula-orb orb-2"></div>
    <div class="nebula-orb orb-3"></div>
    <app-header></app-header>
    <main class="shell-main">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      position: relative;
    }
    .shell-main {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
      z-index: 1;
    }
    .nebula-orb {
      position: fixed;
      border-radius: 50%;
      filter: blur(80px);
      pointer-events: none;
      z-index: 0;
    }
    .orb-1 {
      width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%);
      top: -100px; left: -100px;
      animation: orb-drift-1 20s ease-in-out infinite;
    }
    .orb-2 {
      width: 400px; height: 400px;
      background: radial-gradient(circle, rgba(247,183,49,0.08) 0%, transparent 70%);
      top: 40%; right: -80px;
      animation: orb-drift-2 25s ease-in-out infinite;
    }
    .orb-3 {
      width: 350px; height: 350px;
      background: radial-gradient(circle, rgba(38,222,129,0.06) 0%, transparent 70%);
      bottom: 10%; left: 20%;
      animation: orb-drift-3 18s ease-in-out infinite;
    }
    @keyframes orb-drift-1 {
      0%,100% { transform: translate(0,0) scale(1); }
      33%  { transform: translate(40px, 60px) scale(1.1); }
      66%  { transform: translate(-20px, 30px) scale(0.95); }
    }
    @keyframes orb-drift-2 {
      0%,100% { transform: translate(0,0) scale(1); }
      50% { transform: translate(-30px, -40px) scale(1.15); }
    }
    @keyframes orb-drift-3 {
      0%,100% { transform: translate(0,0) scale(1); }
      40% { transform: translate(50px, -20px) scale(1.08); }
      70% { transform: translate(-10px, 30px) scale(0.92); }
    }
  `]
})
export class ShellComponent {}
