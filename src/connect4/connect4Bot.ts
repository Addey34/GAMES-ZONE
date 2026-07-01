/**
 * Connect 4 bot — the turn-based opponent (used for solo play and to fill an
 * empty online seat). Pure and deterministic given its rng, so it is unit-testable
 * (`connect4Bot.test.ts`) like the rules.
 *
 * One strategy, tuned by {@link Difficulty} exactly like the other bots: with the
 * difficulty's "smart" probability ({@link rollChase}) it plays a **minimax /
 * alpha-beta** search (deeper = stronger), otherwise it drops in a random column —
 * so `easy` is basically random, `hard` searches every time, `medium` slips up.
 */

import { Difficulty, rollChase } from '../shared/bot/difficulty.js';
import { Seat, nextSeat } from '../shared/turn/turnGame.js';
import {
  Connect4State,
  Connect4Move,
  COLS,
  ROWS,
  CONNECT,
  SEATS,
  applyMove,
  discAt,
} from './connect4.js';

/** Search depth per tier (easy mostly plays random anyway). */
const DEPTH: Record<Difficulty, number> = { easy: 2, medium: 4, hard: 5 };
const WIN = 1_000_000;

/** Columns tried centre-first: better moves early → more alpha-beta cut-offs. */
const COLUMN_ORDER = centreFirst();

function centreFirst(): number[] {
  const mid = (COLS - 1) / 2;
  return Array.from({ length: COLS }, (_, c) => c).sort(
    (a, b) => Math.abs(a - mid) - Math.abs(b - mid)
  );
}

/**
 * Chooses a column for the seat to play. `rng` is injectable for tests.
 */
export function decideMove(
  state: Connect4State,
  moves: Connect4Move[],
  difficulty: Difficulty,
  rng: () => number = Math.random
): Connect4Move {
  if (moves.length === 0) return { col: 0 }; // guarded by the caller; safe default
  if (!rollChase(difficulty, rng)) return randomMove(moves, rng);
  return bestMove(state, DEPTH[difficulty]);
}

function randomMove(moves: Connect4Move[], rng: () => number): Connect4Move {
  return moves[Math.floor(rng() * moves.length)];
}

/** The move the search prefers for `state.current`, breaking ties by centrality. */
function bestMove(state: Connect4State, depth: number): Connect4Move {
  const me = state.current;
  let bestCol = orderedMoves(state)[0]?.col ?? 0;
  let best = -Infinity;
  let alpha = -Infinity;
  for (const move of orderedMoves(state)) {
    const score = minimax(applyMove(state, move), depth - 1, alpha, Infinity, me);
    if (score > best) {
      best = score;
      bestCol = move.col;
    }
    alpha = Math.max(alpha, score);
  }
  return { col: bestCol };
}

/** Legal moves in centre-first order. */
function orderedMoves(state: Connect4State): Connect4Move[] {
  const moves: Connect4Move[] = [];
  for (const col of COLUMN_ORDER) {
    if (state.columns[col].length < ROWS && state.winner === null) moves.push({ col });
  }
  return moves;
}

/** Negamax-style alpha-beta from `me`'s point of view (higher = better for me). */
function minimax(
  state: Connect4State,
  depth: number,
  alpha: number,
  beta: number,
  me: Seat
): number {
  if (state.winner !== null) {
    // Prefer faster wins / slower losses via the remaining depth.
    return state.winner === me ? WIN + depth : -WIN - depth;
  }
  const moves = orderedMoves(state);
  if (moves.length === 0) return 0; // full board → draw
  if (depth === 0) return evaluate(state, me);

  const maximizing = state.current === me;
  let value = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    const child = minimax(applyMove(state, move), depth - 1, alpha, beta, me);
    if (maximizing) {
      value = Math.max(value, child);
      alpha = Math.max(alpha, value);
    } else {
      value = Math.min(value, child);
      beta = Math.min(beta, value);
    }
    if (alpha >= beta) break; // prune
  }
  return value;
}

/** Heuristic score of a non-terminal board for `me` (sum over all 4-cell windows). */
function evaluate(state: Connect4State, me: Seat): number {
  const opp = nextSeat(me, SEATS);
  let score = 0;
  // Centre control is worth a little on its own.
  const centre = state.columns[Math.floor(COLS / 2)];
  score += centre.filter((s) => s === me).length * 3;

  const axes: readonly [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      for (const [dc, dr] of axes) {
        const window = readWindow(state.columns, col, row, dc, dr);
        if (window) score += scoreWindow(window, me, opp);
      }
    }
  }
  return score;
}

/** The CONNECT cells starting at (col,row) along (dc,dr), or null if off-board. */
function readWindow(
  columns: Seat[][],
  col: number,
  row: number,
  dc: number,
  dr: number
): (Seat | null)[] | null {
  const endC = col + dc * (CONNECT - 1);
  const endR = row + dr * (CONNECT - 1);
  if (endC < 0 || endC >= COLS || endR < 0 || endR >= ROWS) return null;
  const cells: (Seat | null)[] = [];
  for (let i = 0; i < CONNECT; i++) cells.push(discAt(columns, col + dc * i, row + dr * i));
  return cells;
}

/** Scores one 4-cell window: rewards my near-lines, penalises the opponent's. */
function scoreWindow(window: (Seat | null)[], me: Seat, opp: Seat): number {
  let mine = 0;
  let theirs = 0;
  let empty = 0;
  for (const cell of window) {
    if (cell === me) mine++;
    else if (cell === opp) theirs++;
    else empty++;
  }
  if (mine > 0 && theirs > 0) return 0; // blocked, no potential for either
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 3;
  if (theirs === 3 && empty === 1) return -8; // block the opponent aggressively
  if (theirs === 2 && empty === 2) return -3;
  return 0;
}
