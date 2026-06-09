import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

interface AnalysisMove {
  move_number: number;
  san: string;
  comment: string;
  annotation: string;
}

interface AnalysisResult {
  summary: string;
  moves: AnalysisMove[];
  blunders: number;
  mistakes: number;
  good_moves: number;
}

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './analysis.component.html',
  styleUrls: ['./analysis.component.scss']
})
export class AnalysisComponent {
  pgn = '';
  loading = false;
  result: AnalysisResult | null = null;
  error = '';
  lang = 'en';

  readonly languages = [
    { value: 'en', label: 'EN' },
    { value: 'hi', label: 'HI' },
    { value: 'te', label: 'TE' },
    { value: 'or', label: 'OR' },
  ];

  constructor(private api: ApiService) {}

  analyze() {
    if (!this.pgn.trim() || this.loading) return;
    this.loading = true;
    this.error = '';
    this.result = null;

    this.api.post<AnalysisResult>('/analysis/pgn', { pgn: this.pgn, lang: this.lang }).subscribe({
      next: res => {
        this.result = res;
        this.loading = false;
      },
      error: err => {
        this.error = err?.error?.detail || 'Analysis failed. Please check your PGN and try again.';
        this.loading = false;
      }
    });
  }

  getAnnotationClass(annotation: string): string {
    switch (annotation) {
      case '?':  return 'mistake';
      case '??': return 'blunder';
      case '!':  return 'good';
      case '!!': return 'brilliant';
      default:   return '';
    }
  }

  getAnnotationLabel(annotation: string): string {
    switch (annotation) {
      case '?':  return '?';
      case '??': return '??';
      case '!':  return '!';
      case '!!': return '!!';
      default:   return '';
    }
  }
}
