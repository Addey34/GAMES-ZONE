/**
 * Connect 4 — pure rules (no DOM, no time, no randomness), so the whole game
 * logic is unit-testable in isolation (`connect4.test.ts`). Plugs into the
 * generic turn-based engine (`shared/turn/turnGame.ts`) as a {@link TurnRules};
 * the controller (`Connect4Game`) owns the rendering and the turn pacing.
 *
 * Two players drop discs into a 7-wide × 6-tall grid; a disc falls to the lowest
 * free cell of its column. First to line up **four** of their discs — horizontal,
 * vertical or diagonal — wins. A full board with no line is a draw (represented as
 * `winner === null` with no legal moves left, which the controller detects).
 *
 * The board is stored **by column** (`columns[c]` = discs from the bottom up),
 * which mirrors the "drop" move exactly: a move just pushes onto a column.
 */

import { Seat, TurnRules, nextSeat } from '../shared/turn/turnGame.js';

export const COLS = 7;
export const ROWS = 6;
/** Discs in a row needed to win. */
export const CONNECT = 4;
/** Number of players. */
export const SEATS = 2;

/** A move: drop a disc into column `col`. */
export interface Connect4Move {
  col: number;
}

export const eqMove = (a: Connect4Move, b: Connect4Move): boolean => a.col === b.col;

/** Board state: each column's disc stack, whose turn it is, and the winner. */
export interface Connect4State {
  /** `columns[c]` = the seats of the discs in column `c`, bottom → top. */
  columns: Seat[][];
  current: Seat;
  winner: Seat | null;
}

/** A fresh game: empty columns, seat 0 (red) to play. */
export function initialState(): Connect4State {
  return { columns: Array.from({ length: COLS }, () => []), current: 0, winner: null };
}

export function currentSeat(state: Connect4State): Seat {
  return state.current;
}

/** Whether every column is full (no move possible). */
export function isFull(state: Connect4State): boolean {
  return state.columns.every((col) => col.length >= ROWS);
}

/** The columns the current seat may still drop into (none once won). */
export function legalMoves(state: Connect4State): Connect4Move[] {
  if (state.winner !== null) return [];
  const moves: Connect4Move[] = [];
  for (let col = 0; col < COLS; col++) {
    if (state.columns[col].length < ROWS) moves.push({ col });
  }
  return moves;
}

/** The seat occupying cell (`col`, `row` from the bottom), or `null` if empty/off-board. */
export function discAt(columns: Seat[][], col: number, row: number): Seat | null {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  const stack = columns[col];
  return row < stack.length ? stack[row] : null;
}

/** Whether the disc just placed at (`col`, `row`) by `seat` completes a line of 4. */
function completesLine(columns: Seat[][], col: number, row: number, seat: Seat): boolean {
  // The four axes: horizontal, vertical, and both diagonals.
  const axes: readonly [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dc, dr] of axes) {
    let count = 1; // the placed disc itself
    for (const sign of [1, -1] as const) {
      let c = col + dc * sign;
      let r = row + dr * sign;
      while (discAt(columns, c, r) === seat) {
        count++;
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (count >= CONNECT) return true;
  }
  return false;
}

/** Drops the current seat's disc into `move.col` (assumed legal); never mutates. */
export function applyMove(state: Connect4State, move: Connect4Move): Connect4State {
  const columns = state.columns.map((col) => col.slice());
  const stack = columns[move.col];
  const seat = state.current;
  stack.push(seat);
  const row = stack.length - 1;
  const won = completesLine(columns, move.col, row, seat) ? seat : null;
  const current = won !== null ? seat : nextSeat(seat, SEATS);
  return { columns, current, winner: won };
}

export function winner(state: Connect4State): Seat | null {
  return state.winner;
}

/** The full rule set wired for the generic turn engine. */
export const rules: TurnRules<Connect4State, Connect4Move> = {
  seats: SEATS,
  initialState,
  currentSeat,
  legalMoves,
  applyMove,
  winner,
};
