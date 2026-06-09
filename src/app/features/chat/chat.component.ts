import { Component, ViewChild, ElementRef, AfterViewChecked, OnInit } from '@angular/core';
import { ChatService } from './chat.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface Message {
  role: 'user' | 'ai';
  text: string;
  time: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements AfterViewChecked, OnInit {
  @ViewChild('chatBody') chatBody!: ElementRef;

  // ── Current chat state ───────────────────────────────
  messages: Message[] = [];
  input            = '';
  loading          = false;
  inputFocused     = false;
  private shouldScroll = false;

  // ── Sessions ─────────────────────────────────────────
  sessions: Session[]    = [];
  currentSessionId       = '';
  showSessions           = false;

  // ── Avatar settings ──────────────────────────────────
  aiName     = 'Luna';
  aiGender: 'female' | 'male' = 'female';
  currentMood = 'neutral';
  showSetup   = false;
  tempName    = '';
  tempGender: 'female' | 'male' = 'female';

  // ── Voice output ──────────────────────────────────────
  speakEnabled   = false;
  showLangPicker = false;
  voiceLang      = 'en';

  // ── Voice input (speech recognition) ──────────────────
  isListening    = false;
  voiceChatMode  = false;   // full duplex loop
  interimText    = '';      // live partial transcript
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;

  readonly languages = [
    { code: 'en', label: 'EN',  locale: 'en-US', name: 'English' },
    { code: 'hi', label: 'हि',  locale: 'hi-IN', name: 'Hindi'   },
    { code: 'te', label: 'తె',  locale: 'te-IN', name: 'Telugu'  },
    { code: 'or', label: 'ଓ',   locale: 'or-IN', name: 'Odia'    },
  ];

  readonly moods = [
    { value: 'happy',    label: 'Happy',    emoji: '😊' },
    { value: 'sad',      label: 'Sad',      emoji: '😔' },
    { value: 'anxious',  label: 'Anxious',  emoji: '😰' },
    { value: 'bored',    label: 'Bored',    emoji: '😴' },
    { value: 'excited',  label: 'Excited',  emoji: '🥳' },
    { value: 'romantic', label: 'Romantic', emoji: '🥰' },
    { value: 'neutral',  label: 'Neutral',  emoji: '😌' },
  ];

  // ── Suggestions ──────────────────────────────────────
  readonly allSuggestions = [
    'Best opening for beginners?',
    'I had a rough day…',
    'How do I improve my endgame?',
    'Tell me something interesting!',
    'Explain the Sicilian Defense',
    'I\'m feeling stressed',
    'What\'s the best chess tactic?',
    'Just want to chat 😊',
  ];

  get suggestions() {
    const moodMap: Record<string, string[]> = {
      happy:    ['Let\'s celebrate!', 'Tell me a fun chess fact', 'I\'m on a winning streak!'],
      sad:      ['I need someone to talk to', 'Cheer me up please', 'I had a bad day'],
      anxious:  ['Help me calm down', 'I\'m overwhelmed', 'Give me reassurance'],
      bored:    ['Tell me something interesting', 'Surprise me!', 'Any chess puzzles?'],
      excited:  ['I have great news!', 'I just won a game!', 'What should I try next?'],
      romantic: ['You\'re amazing ✨', 'Tell me something beautiful', 'Write me a poem 🌹', 'Whisper something sweet'],
      neutral:  this.allSuggestions.slice(0, 4),
    };
    return moodMap[this.currentMood] ?? moodMap['neutral'];
  }

  get currentMoodObj() {
    return this.moods.find(m => m.value === this.currentMood)!;
  }

  // ── Lifecycle ────────────────────────────────────────
  constructor(private chatService: ChatService) {}

  ngOnInit() {
    // Load avatar settings
    const saved = localStorage.getItem('chess_ai_companion');
    if (saved) {
      try { const p = JSON.parse(saved); this.aiName = p.name || 'Luna'; this.aiGender = p.gender || 'female'; } catch { /**/ }
    }
    this.tempName   = this.aiName;
    this.tempGender = this.aiGender;

    // Pre-load speech voices (browser loads them async)
    window.speechSynthesis?.getVoices();

    // Load sessions
    const rawSessions = localStorage.getItem('chess_ai_sessions');
    if (rawSessions) {
      try { this.sessions = JSON.parse(rawSessions); } catch { this.sessions = []; }
    }

    // Start fresh session
    this.newSession();
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) { this.scrollToBottom(); this.shouldScroll = false; }
  }

  private scrollToBottom() {
    const el = this.chatBody?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  private getTime(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Sessions CRUD ─────────────────────────────────────
  newSession() {
    const id = Date.now().toString();
    const session: Session = { id, title: 'New Chat', createdAt: Date.now(), messages: [] };
    this.sessions.unshift(session);
    this.currentSessionId = id;
    this.messages = session.messages;
    this.saveSessions();
    this.showSessions = false;
  }

  loadSession(id: string) {
    const s = this.sessions.find(s => s.id === id);
    if (!s) return;
    this.currentSessionId = id;
    this.messages = s.messages;
    this.showSessions = false;
    this.shouldScroll = true;
  }

  deleteSession(id: string, event: Event) {
    event.stopPropagation();
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.currentSessionId === id) {
      if (this.sessions.length > 0) this.loadSession(this.sessions[0].id);
      else this.newSession();
    }
    this.saveSessions();
  }

  private saveSessions() {
    // Keep max 30 sessions, trim messages for storage
    const trimmed = this.sessions.slice(0, 30);
    localStorage.setItem('chess_ai_sessions', JSON.stringify(trimmed));
  }

  private updateCurrentSession() {
    const s = this.sessions.find(s => s.id === this.currentSessionId);
    if (!s) return;
    s.messages = [...this.messages];
    // Auto-title from first user message
    const first = this.messages.find(m => m.role === 'user');
    if (first && s.title === 'New Chat') {
      s.title = first.text.slice(0, 32) + (first.text.length > 32 ? '…' : '');
    }
    this.saveSessions();
  }

  get currentSession(): Session | undefined {
    return this.sessions.find(s => s.id === this.currentSessionId);
  }

  formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000)  return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // ── Avatar setup ──────────────────────────────────────
  openSetup() {
    this.tempName   = this.aiName;
    this.tempGender = this.aiGender;
    this.showSetup  = true;
  }

  saveSetup() {
    this.aiName   = this.tempName.trim() || (this.tempGender === 'female' ? 'Luna' : 'Orion');
    this.aiGender = this.tempGender;
    localStorage.setItem('chess_ai_companion', JSON.stringify({ name: this.aiName, gender: this.aiGender }));
    this.showSetup = false;
  }

  cancelSetup() { this.showSetup = false; }

  setMood(m: string) { this.currentMood = m; }

  // ── Voice ─────────────────────────────────────────────
  toggleSpeak() {
    this.speakEnabled = !this.speakEnabled;
    if (!this.speakEnabled) window.speechSynthesis?.cancel();
  }

  // ── Voice input ────────────────────────────────────────
  get hasMicSupport(): boolean {
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  private initRecognition() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    this.recognition = new SR();
    this.recognition.continuous     = false;
    this.recognition.interimResults = true;
    this.recognition.lang           = this.currentLang.locale;

    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final   = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      this.interimText = interim;
      if (final) {
        this.input       = final.trim();
        this.interimText = '';
        this.isListening = false;
        this.send();                     // auto-send when speech ends
      }
    };

    this.recognition.onerror = (e: any) => {
      console.warn('Speech recognition error:', e.error);
      this.isListening = false;
      this.interimText = '';
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.interimText = '';
    };
  }

  toggleMic() {
    if (this.isListening) {
      this.recognition?.stop();
      this.isListening = false;
      this.interimText = '';
      return;
    }
    if (!this.hasMicSupport) return;
    if (!this.recognition) this.initRecognition();

    // Update lang before each use
    if (this.recognition) this.recognition.lang = this.currentLang.locale;

    this.isListening = true;
    this.interimText = '';
    try { this.recognition.start(); } catch { this.isListening = false; }
  }

  toggleVoiceChat() {
    this.voiceChatMode = !this.voiceChatMode;
    if (this.voiceChatMode) {
      this.speakEnabled = true;       // voice chat implies TTS on
      this.toggleMic();               // start listening immediately
    } else {
      this.recognition?.stop();
      this.isListening = false;
    }
  }

  /** Strip emojis, chess symbols, markdown — they sound terrible when spoken */
  private cleanForSpeech(text: string): string {
    return text
      // Emojis (broad unicode range)
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      // Chess + special symbols
      .replace(/[♟♛♜♝♞♚♙♕♖♗♘♔✦◆◈⬡◎★☆•·]/g, '')
      // Markdown bold/italic/code
      .replace(/[*_`#]/g, '')
      // Ellipsis → natural pause
      .replace(/…|\.\.\./, ', ')
      // Multiple spaces
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  setLang(code: string) {
    this.voiceLang     = code;
    this.showLangPicker = false;
  }

  get currentLang() {
    return this.languages.find(l => l.code === this.voiceLang) ?? this.languages[0];
  }

  private pickVoice(voices: SpeechSynthesisVoice[], gender: 'female' | 'male', lang: string): SpeechSynthesisVoice | null {
    // ── Non-English: find matching locale first ──────────
    if (lang !== 'en') {
      const localeMap: Record<string, string> = { hi: 'hi-IN', te: 'te-IN', or: 'or-IN' };
      const locale = localeMap[lang];
      if (locale) {
        // 1. Exact locale match (e.g. "Google हिन्दी", "hi-IN")
        const exact = voices.find(v => v.lang === locale);
        if (exact) return exact;
        // 2. Language prefix match
        const prefix = voices.find(v => v.lang.startsWith(locale.split('-')[0]));
        if (prefix) return prefix;
      }
      // If language voice not available, fall through to English (TTS will still work)
    }

    // ── English / fallback ───────────────────────────────
    const femaleNames = [
      'Samantha', 'Karen', 'Moira', 'Tessa', 'Victoria', 'Ava',
      'Google UK English Female', 'Google US English',
      'Microsoft Aria Online', 'Microsoft Jenny Online',
      'Microsoft Aria', 'Microsoft Jenny', 'Hazel', 'Zira',
    ];
    const maleNames = [
      'Daniel', 'Alex', 'Aaron', 'Tom',
      'Google UK English Male',
      'Microsoft Guy Online', 'Microsoft Davis Online',
      'Microsoft Guy', 'Microsoft Davis', 'Microsoft Mark',
    ];
    const names = gender === 'female' ? femaleNames : maleNames;

    for (const name of names) {
      const v = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (v) return v;
    }
    const neural = voices.find(v =>
      v.lang.startsWith('en') &&
      /online|neural|enhanced|premium/i.test(v.name) &&
      (gender === 'female' ? !/male/i.test(v.name) : !/female/i.test(v.name))
    );
    if (neural) return neural;
    const decent = voices.find(v =>
      (v.lang === 'en-US' || v.lang === 'en-GB') && !/compact/i.test(v.name)
    );
    if (decent) return decent;
    return voices.find(v => v.lang.startsWith('en')) ?? null;
  }

  private speak(text: string) {
    if (!this.speakEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const cleaned = this.cleanForSpeech(text);
    if (!cleaned) return;

    const utt    = new SpeechSynthesisUtterance(cleaned);
    const voices = window.speechSynthesis.getVoices();
    const voice  = this.pickVoice(voices, this.aiGender, this.voiceLang);
    const locale = this.currentLang.locale;

    if (voice) utt.voice = voice;
    utt.lang   = locale;
    utt.pitch  = this.aiGender === 'female' ? 1.08 : 0.92;
    utt.rate   = 0.87;
    utt.volume = 1.0;

    // ── Voice chat loop: mic opens after AI finishes speaking ──
    utt.onend = () => {
      if (this.voiceChatMode && !this.loading) {
        setTimeout(() => this.toggleMic(), 600);
      }
    };

    window.speechSynthesis.speak(utt);
  }

  // ── Send ──────────────────────────────────────────────
  quickSend(text: string) { this.input = text; this.send(); }

  send() {
    if (!this.input.trim() || this.loading) return;

    const userMsg = this.input.trim();
    let apiMsg    = userMsg;
    if (this.currentMood !== 'neutral') apiMsg = `Mood: ${this.currentMood}. ${userMsg}`;

    this.messages.push({ role: 'user', text: userMsg, time: this.getTime() });
    this.input        = '';
    this.loading      = true;
    this.shouldScroll = true;
    this.updateCurrentSession();

    this.chatService.sendMessage(apiMsg, 'avatar', this.voiceLang).subscribe({
      next: res => {
        this.messages.push({ role: 'ai', text: res.reply, time: this.getTime() });
        this.loading      = false;
        this.shouldScroll = true;
        this.updateCurrentSession();
        this.speak(res.reply);
      },
      error: () => {
        this.messages.push({ role: 'ai', text: 'Something went wrong ❌', time: this.getTime() });
        this.loading      = false;
        this.shouldScroll = true;
        this.updateCurrentSession();
      }
    });
  }
}
