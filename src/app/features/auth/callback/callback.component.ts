import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [CommonModule],
  template: `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0b1a2f;color:white;font-size:18px">Completing login... &#9823;</div>`
})
export class CallbackComponent implements OnInit {
  constructor(private router: Router) {}
  ngOnInit() {
    setTimeout(() => this.router.navigate(['/chat']), 500);
  }
}
