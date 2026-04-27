import { Component, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ChatService } from './chat.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Message {
  role: string;
  text: string;
  time: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('chatBody') chatBody!: ElementRef;

  mode = 'coach';
  messages: Message[] = [];
  input = '';
  loading = false;
  inputFocused = false;
  private shouldScroll = false;

  readonly modeConfig = {
    coach: { label: 'Coach', icon: '🎓', color: '#3b82f6', desc: 'Structured, clear chess advice' },
    fun:   { label: 'Fun',   icon: '😄', color: '#f59e0b', desc: 'Casual, witty & playful' },
    serious: { label: 'Serious', icon: '♟️', color: '#10b981', desc: 'Precise, analytical expert' }
  };

  constructor(private chatService: ChatService) {}

  get currentMode() {
    return this.modeConfig[this.mode as keyof typeof this.modeConfig];
  }

  get modeEntries() {
    return Object.entries(this.modeConfig).map(([key, value]) => ({ key, value }));
  }

  setMode(m: string) {
    this.mode = m;
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private scrollToBottom() {
    const el = this.chatBody?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  private getTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  quickSend(text: string) {
    this.input = text;
    this.send();
  }

  send() {
    if (!this.input.trim() || this.loading) return;

    const userMsg = this.input;
    this.messages.push({ role: 'user', text: userMsg, time: this.getTime() });
    this.input = '';
    this.loading = true;
    this.shouldScroll = true;

    this.chatService.sendMessage(userMsg, this.mode).subscribe({
      next: (res) => {
        this.messages.push({ role: 'ai', text: res.reply, time: this.getTime() });
        this.loading = false;
        this.shouldScroll = true;
      },
      error: () => {
        this.messages.push({ role: 'ai', text: 'Something went wrong ❌', time: this.getTime() });
        this.loading = false;
        this.shouldScroll = true;
      }
    });
  }
}
