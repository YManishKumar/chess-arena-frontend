export interface Tile {
  left: number;
  right: number;
  id: string;
}

export type Side = 'left' | 'right';

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  hand: Tile[];
  score: number;
}

export interface ChainTile extends Tile {
  orientation: 'horizontal' | 'vertical';
  flipped: boolean;
}

export interface GameState {
  players: Player[];
  chain: ChainTile[];
  leftEnd: number;
  rightEnd: number;
  currentPlayerIndex: number;
  phase: 'playing' | 'round_over';
  winnerId: string | null;
}
