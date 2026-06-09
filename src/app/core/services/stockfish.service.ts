import { Injectable } from '@angular/core';

export type AIDifficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

@Injectable({ providedIn: 'root' })
export class StockfishService {
  private worker: Worker | null = null;
  private resolver: ((move: string) => void) | null = null;
  private rejector: ((e: Error) => void) | null = null;
  private ready = false;
  private pendingCall: { fen: string; difficulty: AIDifficulty; resolve: (m: string) => void; reject: (e: Error) => void } | null = null;

  private readonly skillLevel: Record<AIDifficulty, number> = { beginner: 0, easy: 3, medium: 8, hard: 16, expert: 20 };
  private readonly searchDepth: Record<AIDifficulty, number> = { beginner: 1, easy: 3, medium: 6, hard: 12, expert: 20 };

  init(): void {
    if (this.worker) return;
    try {
      this.worker = new Worker('/stockfish.js');
      this.worker.onmessage = (e: MessageEvent) => this.onMessage(String(e.data));
      this.worker.onerror   = (err) => {
        console.warn('Stockfish worker error', err);
        this.worker = null;
        this.ready  = false;
        this.rejector?.(new Error('Stockfish worker error'));
        this.resolver = null; this.rejector = null;
      };
      this.worker.postMessage('uci');
    } catch (e) {
      console.warn('Stockfish init failed', e);
      this.worker = null;
    }
  }

  private onMessage(msg: string): void {
    // Use includes — Stockfish may append extra info on same line
    if (msg.includes('uciok')) {
      this.worker?.postMessage('isready');
    }
    if (msg.includes('readyok')) {
      this.ready = true;
      // Fire any call that was queued before engine was ready
      if (this.pendingCall) {
        const { fen, difficulty, resolve, reject } = this.pendingCall;
        this.pendingCall = null;
        this.sendPosition(fen, difficulty, resolve, reject);
      }
    }
    if (msg.startsWith('bestmove')) {
      const parts = msg.split(' ');
      const move  = parts[1];
      if (move && move !== '(none)' && this.resolver) {
        this.resolver(move);
      } else if (this.rejector) {
        this.rejector(new Error('No bestmove'));
      }
      this.resolver = null;
      this.rejector  = null;
    }
  }

  private sendPosition(fen: string, difficulty: AIDifficulty, resolve: (m: string) => void, reject: (e: Error) => void) {
    this.resolver = resolve;
    this.rejector  = reject;
    const skill = this.skillLevel[difficulty];
    const depth = this.searchDepth[difficulty];
    this.worker!.postMessage('ucinewgame');
    this.worker!.postMessage(`setoption name Skill Level value ${skill}`);
    this.worker!.postMessage(`position fen ${fen}`);
    this.worker!.postMessage(`go depth ${depth}`);

    // 12-second timeout
    setTimeout(() => {
      if (this.resolver === resolve) {
        this.resolver = null;
        this.rejector  = null;
        reject(new Error('Stockfish timeout'));
      }
    }, 12000);
  }

  getBestMove(fen: string, difficulty: AIDifficulty): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Stockfish not initialized'));
        return;
      }
      if (!this.ready) {
        // Queue — engine still initialising
        this.pendingCall = { fen, difficulty, resolve, reject };
        return;
      }
      this.sendPosition(fen, difficulty, resolve, reject);
    });
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready  = false;
    this.resolver = null;
    this.rejector  = null;
    this.pendingCall = null;
  }
}
