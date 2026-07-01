import { describe, expect, it } from 'vitest';
import { Seat } from '../shared/turn/turnGame.js';
import {
  Connect4State,
  COLS,
  ROWS,
  initialState,
  legalMoves,
  applyMove,
  isFull,
  discAt,
} from './connect4.js';

/** Plays a sequence of columns, alternating from seat 0, stopping if someone wins. */
function play(cols: number[]): Connect4State {
  let state = initialState();
  for (const col of cols) {
    if (state.winner !== null) break;
    state = applyMove(state, { col });
  }
  return state;
}

/** Builds a state from raw columns (bottom → top), current seat and winner. */
function make(columns: Seat[][], current: Seat = 0): Connect4State {
  const full: Seat[][] = Array.from({ length: COLS }, (_, c) => columns[c] ?? []);
  return { columns: full, current, winner: null };
}

describe('initialState / legalMoves', () => {
  it('starts empty with seat 0 to play and every column open', () => {
    const s = initialState();
    expect(s.current).toBe(0);
    expect(s.winner).toBeNull();
    expect(legalMoves(s).map((m) => m.col)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('drops a full column from the legal moves', () => {
    const s = make([[0, 1, 0, 1, 0, 1]]); // column 0 is full (6 discs)
    expect(s.columns[0].length).toBe(ROWS);
    expect(legalMoves(s).some((m) => m.col === 0)).toBe(false);
    expect(legalMoves(s)).toHaveLength(COLS - 1);
  });
});

describe('applyMove', () => {
  it('stacks discs from the bottom and alternates the turn', () => {
    let s = applyMove(initialState(), { col: 3 });
    expect(s.columns[3]).toEqual([0]);
    expect(s.current).toBe(1);
    s = applyMove(s, { col: 3 });
    expect(s.columns[3]).toEqual([0, 1]); // 0 at the bottom, 1 on top
    expect(s.current).toBe(0);
  });

  it('does not mutate the input state', () => {
    const s = initialState();
    applyMove(s, { col: 0 });
    expect(s.columns[0]).toEqual([]);
  });

  it('does not declare a winner for three in a row', () => {
    const s = play([0, 1, 0, 1, 0]); // seat 0 has three stacked in column 0
    expect(s.winner).toBeNull();
    expect(legalMoves(s).length).toBeGreaterThan(0);
  });
});

describe('win detection', () => {
  it('detects a vertical four', () => {
    const s = play([0, 1, 0, 1, 0, 1, 0]); // seat 0 stacks four in column 0
    expect(s.winner).toBe(0);
    expect(legalMoves(s)).toEqual([]); // game over → no moves
  });

  it('detects a horizontal four', () => {
    const s = play([0, 0, 1, 1, 2, 2, 3]); // seat 0 fills the bottom of cols 0..3
    expect(s.winner).toBe(0);
  });

  it('detects a rising diagonal', () => {
    // Seat 0 at (0,0),(1,1),(2,2); dropping column 3 lands seat 0 at (3,3).
    const s = make([[0], [1, 0], [1, 1, 0], [1, 1, 1]], 0);
    expect(applyMove(s, { col: 3 }).winner).toBe(0);
  });

  it('detects a falling diagonal', () => {
    // Seat 0 at (3,0),(2,1),(1,2); dropping column 0 lands seat 0 at (0,3).
    const s = make([[1, 1, 1], [1, 1, 0], [1, 0], [0]], 0);
    expect(applyMove(s, { col: 0 }).winner).toBe(0);
  });
});

describe('board full', () => {
  it('reports a full board with no moves left', () => {
    const columns: Seat[][] = Array.from({ length: COLS }, () => [0, 1, 0, 1, 0, 1]);
    const s: Connect4State = { columns, current: 0, winner: null };
    expect(isFull(s)).toBe(true);
    expect(legalMoves(s)).toEqual([]);
  });
});

describe('discAt', () => {
  it('reads discs bottom-indexed and returns null off-board or empty', () => {
    const s = make([[0, 1]]);
    expect(discAt(s.columns, 0, 0)).toBe(0);
    expect(discAt(s.columns, 0, 1)).toBe(1);
    expect(discAt(s.columns, 0, 2)).toBeNull(); // empty
    expect(discAt(s.columns, -1, 0)).toBeNull(); // off-board
    expect(discAt(s.columns, 0, ROWS)).toBeNull();
  });
});
