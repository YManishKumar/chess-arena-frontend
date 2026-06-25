import { Tile, Player, GameState, ChainTile, Side } from './domino.models';

export function generateTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (let l = 0; l <= 6; l++) {
    for (let r = l; r <= 6; r++) {
      tiles.push({ left: l, right: r, id: `${l}|${r}` });
    }
  }
  return tiles;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealTiles(playerNames: string[]): { players: Player[]; boneyard: Tile[] } {
  const all = shuffle(generateTiles());
  const players: Player[] = playerNames.map((name, i) => ({
    id: i === 0 ? 'human' : `bot${i}`,
    name,
    isBot: i !== 0,
    hand: all.splice(0, 7),
    score: 0,
  }));
  return { players, boneyard: all };
}

export function findFirstPlayer(players: Player[]): number {
  let bestDouble = -1;
  let bestPlayerIdx = 0;
  for (let pi = 0; pi < players.length; pi++) {
    for (const tile of players[pi].hand) {
      if (tile.left === tile.right && tile.left > bestDouble) {
        bestDouble = tile.left;
        bestPlayerIdx = pi;
      }
    }
  }
  return bestPlayerIdx;
}

export function initGame(playerNames: string[]): GameState {
  const { players } = dealTiles(playerNames);
  const firstPlayerIdx = findFirstPlayer(players);
  return {
    players,
    chain: [],
    leftEnd: -1,
    rightEnd: -1,
    currentPlayerIndex: firstPlayerIdx,
    phase: 'playing',
    winnerId: null,
  };
}

export function getValidMoves(hand: Tile[], leftEnd: number, rightEnd: number): Tile[] {
  if (leftEnd === -1) return hand;
  return hand.filter(t =>
    t.left === leftEnd || t.right === leftEnd ||
    t.left === rightEnd || t.right === rightEnd
  );
}

export function canPlayOnSide(tile: Tile, end: number): boolean {
  return tile.left === end || tile.right === end;
}

export function playTile(state: GameState, playerId: string, tile: Tile, side: Side): GameState {
  const playerIdx = state.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return state;
  const player = state.players[playerIdx];

  const newHand = player.hand.filter(t => t.id !== tile.id);

  let newLeftEnd = state.leftEnd;
  let newRightEnd = state.rightEnd;
  let chainTile: ChainTile;

  if (state.chain.length === 0) {
    chainTile = { ...tile, orientation: 'horizontal', flipped: false };
    newLeftEnd = tile.left;
    newRightEnd = tile.right;
  } else if (side === 'left') {
    const flipped = tile.right !== state.leftEnd;
    chainTile = { ...tile, orientation: 'horizontal', flipped };
    newLeftEnd = flipped ? tile.right : tile.left;
  } else {
    const flipped = tile.left !== state.rightEnd;
    chainTile = { ...tile, orientation: 'horizontal', flipped };
    newRightEnd = flipped ? tile.left : tile.right;
  }

  const newChain = side === 'left'
    ? [chainTile, ...state.chain]
    : [...state.chain, chainTile];

  const newPlayers = state.players.map((p, i) =>
    i === playerIdx ? { ...p, hand: newHand } : p
  );

  const nextState: GameState = {
    ...state,
    players: newPlayers,
    chain: newChain,
    leftEnd: newLeftEnd,
    rightEnd: newRightEnd,
    currentPlayerIndex: (playerIdx + 1) % state.players.length,
  };

  return checkRoundOver(nextState, playerIdx);
}

export function passMove(state: GameState): GameState {
  const nextIdx = (state.currentPlayerIndex + 1) % state.players.length;
  const nextState = { ...state, currentPlayerIndex: nextIdx };
  return checkRoundOver(nextState, state.currentPlayerIndex);
}

function checkRoundOver(state: GameState, lastPlayerIdx: number): GameState {
  const player = state.players[lastPlayerIdx];

  if (player.hand.length === 0) {
    return endRound(state, player.id);
  }

  const allBlocked = state.players.every(p =>
    getValidMoves(p.hand, state.leftEnd, state.rightEnd).length === 0
  );
  if (allBlocked) {
    const sorted = [...state.players].sort((a, b) => pipCount(a) - pipCount(b));
    return endRound(state, sorted[0].id);
  }

  return state;
}

function endRound(state: GameState, winnerId: string): GameState {
  const players = state.players.map(p => ({
    ...p,
    score: pipCount(p),
  }));
  return { ...state, players, phase: 'round_over', winnerId };
}

export function pipCount(player: Player): number {
  return player.hand.reduce((sum, t) => sum + t.left + t.right, 0);
}

export function calcRanks(players: Player[]): { id: string; rank: number; score: number }[] {
  return [...players]
    .sort((a, b) => a.score - b.score)
    .map((p, i) => ({ id: p.id, rank: i + 1, score: p.score }));
}

export function botMove(state: GameState, botId: string): { tile: Tile; side: Side } | null {
  const bot = state.players.find(p => p.id === botId);
  if (!bot) return null;

  const valid = getValidMoves(bot.hand, state.leftEnd, state.rightEnd);
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => {
    const aIsDouble = a.left === a.right ? 1 : 0;
    const bIsDouble = b.left === b.right ? 1 : 0;
    if (bIsDouble !== aIsDouble) return bIsDouble - aIsDouble;
    return (b.left + b.right) - (a.left + a.right);
  });

  const tile = sorted[0];
  if (state.chain.length === 0) return { tile, side: 'right' };
  const side: Side = canPlayOnSide(tile, state.leftEnd) ? 'left' : 'right';
  return { tile, side };
}
