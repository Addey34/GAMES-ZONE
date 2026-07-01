/**
 * Ludo board geometry — the mapping from the abstract rules (a horse's distance
 * `d` along its path) to a cell `[row, col]` on the classic 15×15 cross board.
 *
 * Kept separate from the rules (`ludo.ts`) and pure, so the layout can be
 * unit-tested on its own: `board.test.ts` checks the ring is a continuous,
 * closed 52-cell loop and that each home lane connects to it. This catches a
 * mistyped coordinate automatically, without having to look at the board.
 *
 * Conventions: 15×15 grid, `[row, col]` 0-indexed from the top-left. The four
 * seats sit left / top / right / bottom (clockwise), each entering the ring at
 * `entryCell(seat) = seat*13`, which is exactly `RING_PATH[seat*13]`.
 */

import { Seat } from '../shared/turn/turnGame.js';
import { entryCell, STABLE, RING, RING_TRAVEL, FINISH } from './ludo.js';

export type Cell = readonly [number, number];

/** Side of the (square) board in cells. */
export const GRID = 15;

/**
 * The 52 ring cells in clockwise order, starting at seat 0's entry. A horse on
 * the ring at distance `d` occupies `RING_PATH[(entryCell(seat) + d) % 52]`.
 */
export const RING_PATH: readonly Cell[] = [
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5], // left arm, upper lane → up
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [0, 6],
  [0, 7],
  [0, 8], // top edge
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8], // top arm, right lane → right
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [6, 13],
  [6, 14],
  [7, 14],
  [8, 14], // right edge
  [8, 13],
  [8, 12],
  [8, 11],
  [8, 10],
  [8, 9], // right arm, lower lane → down
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
  [14, 8],
  [14, 7],
  [14, 6], // bottom edge
  [13, 6],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6], // bottom arm, left lane → left
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
  [7, 0],
  [6, 0], // left edge → back to start
];

/**
 * The five private home-lane cells of each seat (distances 51..55), from the
 * ring-side inward; the sixth home distance (FINISH) is the shared centre.
 */
export const HOME_LANES: readonly (readonly Cell[])[] = [
  [
    [7, 1],
    [7, 2],
    [7, 3],
    [7, 4],
    [7, 5],
  ], // seat 0 (left), along row 7
  [
    [1, 7],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
  ], // seat 1 (top), along col 7
  [
    [7, 13],
    [7, 12],
    [7, 11],
    [7, 10],
    [7, 9],
  ], // seat 2 (right), along row 7
  [
    [13, 7],
    [12, 7],
    [11, 7],
    [10, 7],
    [9, 7],
  ], // seat 3 (bottom), along col 7
];

/** The four stable slots (one per horse) inside each seat's corner base. */
export const STABLES: readonly (readonly Cell[])[] = [
  [
    [1, 1],
    [1, 4],
    [4, 1],
    [4, 4],
  ], // seat 0 — top-left base
  [
    [1, 10],
    [1, 13],
    [4, 10],
    [4, 13],
  ], // seat 1 — top-right base
  [
    [10, 10],
    [10, 13],
    [13, 10],
    [13, 13],
  ], // seat 2 — bottom-right base
  [
    [10, 1],
    [10, 4],
    [13, 1],
    [13, 4],
  ], // seat 3 — bottom-left base
];

/** The shared centre where finished horses gather. */
export const CENTER: Cell = [7, 7];

/** Ring index (0..51) of a horse at ring distance `d` for `seat`. */
export function ringIndex(seat: Seat, d: number): number {
  return (entryCell(seat) + d) % RING;
}

/**
 * The board cell of horse `pawn` of `seat` at distance `d`: its stable slot, a
 * ring cell, a home-lane cell or the centre.
 */
export function pawnCell(seat: Seat, pawn: number, d: number): Cell {
  if (d === STABLE) return STABLES[seat][pawn];
  if (d < RING_TRAVEL) return RING_PATH[ringIndex(seat, d)];
  if (d < FINISH) return HOME_LANES[seat][d - RING_TRAVEL];
  return CENTER;
}
