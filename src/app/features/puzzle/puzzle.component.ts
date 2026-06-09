import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface DailyPuzzle {
  id: string;
  rating: number;
  fen: string;
  solution: string[];
  themes: string[];
}

interface UserStreak {
  current_streak: number;
  max_streak: number;
  total_solved: number;
}

interface LeaderboardEntry {
  user_id: string;
  current_streak: number;
}

@Component({
  selector: 'app-puzzle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './puzzle.component.html',
  styleUrls: ['./puzzle.component.scss']
})
export class PuzzleComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  puzzle: DailyPuzzle | null = null;
  streak: UserStreak | null = null;
  leaderboard: LeaderboardEntry[] = [];
  loading = true;
  boardFen = '';
  selectedMove = '';
  solved: boolean | null = null;
  showSolution = false;
  puzzleError = '';

  readonly today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  ngOnInit() {
    this.loadPuzzle();
    this.loadLeaderboard();
  }

  loadPuzzle() {
    this.loading = true;
    this.api.get<DailyPuzzle>('/puzzle/daily').subscribe({
      next: puzzle => {
        this.puzzle = puzzle;
        this.boardFen = puzzle.fen;
        this.loading = false;
      },
      error: () => {
        this.puzzleError = 'Could not load today\'s puzzle. Please try again.';
        this.loading = false;
      }
    });
  }

  submitSolution(userMoves: string[]) {
    const userId = this.auth.getEmail();
    if (!userId || !this.puzzle) return;

    const isCorrect = userMoves.length > 0 &&
      userMoves.every((m, i) => m === this.puzzle!.solution[i]) &&
      userMoves.length === this.puzzle.solution.length;

    this.solved = userMoves.length > 0 ? isCorrect : false;

    this.api.post<UserStreak>('/puzzle/solve', {
      user_id: userId,
      solved: this.solved
    }).subscribe({
      next: streak => { this.streak = streak; },
      error: () => {}
    });
  }

  revealSolution() {
    this.showSolution = true;
    this.submitSolution([]);
  }

  loadLeaderboard() {
    this.api.get<LeaderboardEntry[]>('/puzzle/leaderboard').subscribe({
      next: entries => { this.leaderboard = entries; },
      error: () => {}
    });
  }

  getRankMedal(index: number): string {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return String(index + 1);
  }

  truncateUserId(userId: string): string {
    if (!userId) return '?';
    const local = userId.includes('@') ? userId.split('@')[0] : userId;
    return local.length > 12 ? local.slice(0, 12) + '…' : local;
  }

  formatTheme(theme: string): string {
    return theme.replace(/([A-Z])/g, ' $1').trim();
  }

  get streakMeme(): string {
    const s = this.streak?.current_streak ?? 0;
    if (s === 0)        return "L start. It's giving first day energy. 💀";
    if (s === 1)        return 'one step fr fr. keep going bestie 🔥';
    if (s <= 4)         return 'lowkey on a streak no cap 👀';
    if (s <= 9)         return 'understood the assignment! bussin streak 🚀';
    if (s <= 19)        return 'main character arc fr 👑';
    return 'GRANDMASTER ERA we see you 🏆';
  }

  get solvedMeme(): string {
    if (this.solved === null) return '';
    const wins  = ['slay! 🔥', 'no cap that\'s bussin ✨', 'understood the assignment! 💅', 'main character move 👑'];
    const fails = ['L move bestie 💀', 'cooked fr fr', "that ain't it chief 😤"];
    const arr = this.solved ? wins : fails;
    // deterministic pick so it doesn't re-randomise on each CD cycle
    return arr[0];
  }

  get difficultyLabel(): string {
    if (!this.puzzle) return '';
    if (this.puzzle.rating < 1200) return 'Beginner';
    if (this.puzzle.rating < 1600) return 'Intermediate';
    if (this.puzzle.rating < 2000) return 'Advanced';
    return 'Expert';
  }

  get difficultyClass(): string {
    if (!this.puzzle) return '';
    if (this.puzzle.rating < 1200) return 'diff-beginner';
    if (this.puzzle.rating < 1600) return 'diff-intermediate';
    if (this.puzzle.rating < 2000) return 'diff-advanced';
    return 'diff-expert';
  }
}
