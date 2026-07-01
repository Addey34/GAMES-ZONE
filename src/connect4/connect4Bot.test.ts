import { describe, expect, it } from 'vitest';
import { Seat } from '../shared/turn/turnGame.js';
import { Connect4State, COLS, legalMoves, initialState } from './connect4.js';
import { decideMove } from './connect4Bot.js';

/** Builds a state from raw columns (bottom → top) with `current` to play. */
function make(columns: Seat[][], current: Seat = 0): Connect4State {
  const cols: Seat[][] = Array.from({ length: COLS }, (_, c) => columns[c] ?? []);
  return { columns: cols, current, winner: null };
}

const pick = (s: Connect4State, difficulty: 'easy' | 'medium' | 'hard', rng = () => 0): number =>
  decideMove(s, legalMoves(s), difficulty, rng).col;

describe('decideMove', () => {
  it('always returns a legal column', () => {
    const s = make([[0], [1, 1]]);
    const legal = new Set(legalMoves(s).map((m) => m.col));
    expect(legal.has(pick(s, 'medium', () => 0.5))).toBe(true);
  });

  it('hard takes an immediate winning drop', () => {
    // Seat 0 has three stacked in column 0; dropping column 0 wins.
    const s = make([[0, 0, 0]], 0);
    expect(pick(s, 'hard')).toBe(0);
  });

  it('hard blocks an immediate winning drop by the opponent', () => {
    // Seat 1 threatens a vertical four in column 3; seat 0 (bot) must block it.
    const s = make([[], [], [], [1, 1, 1]], 0);
    expect(pick(s, 'hard')).toBe(3);
  });

  it('easy plays the random column its rng selects (no search)', () => {
    // rng 0.5 -> floor(0.5 * 7) = index 3 in the full legal-move list.
    expect(pick(initialState(), 'easy', () => 0.5)).toBe(3);
  });
});
