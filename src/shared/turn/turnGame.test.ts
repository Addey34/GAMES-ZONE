import { describe, it, expect } from 'vitest';
import { TurnRules, nextSeat, isOver, tryMove } from './turnGame.js';

describe('nextSeat', () => {
  it('advances clockwise', () => {
    expect(nextSeat(0, 4)).toBe(1);
    expect(nextSeat(2, 4)).toBe(3);
  });

  it('wraps around the table', () => {
    expect(nextSeat(3, 4)).toBe(0);
    expect(nextSeat(1, 2)).toBe(0);
  });
});

/**
 * Trivial reference game used to exercise the generic helpers: a single counter
 * that each move increments; seat 0 "wins" once the counter reaches `target`.
 */
interface CountState {
  value: number;
  target: number;
}
type CountMove = { step: number };

function countRules(target = 3): TurnRules<CountState, CountMove> {
  return {
    seats: 2,
    initialState: () => ({ value: 0, target }),
    currentSeat: (s) => s.value % 2,
    legalMoves: (s) => (s.value >= s.target ? [] : [{ step: 1 }, { step: 2 }]),
    applyMove: (s, m) => ({ ...s, value: s.value + m.step }),
    winner: (s) => (s.value >= s.target ? 0 : null),
  };
}

const eqMove = (a: CountMove, b: CountMove): boolean => a.step === b.step;

describe('isOver', () => {
  it('is false at the start and true once a winner exists', () => {
    const rules = countRules(2);
    expect(isOver(rules, rules.initialState())).toBe(false);
    expect(isOver(rules, { value: 2, target: 2 })).toBe(true);
  });
});

describe('tryMove', () => {
  it('applies a legal move and returns the new state', () => {
    const rules = countRules();
    const next = tryMove(rules, rules.initialState(), { step: 2 }, eqMove);
    expect(next?.value).toBe(2);
  });

  it('rejects a move that is not in the legal set', () => {
    const rules = countRules();
    expect(tryMove(rules, rules.initialState(), { step: 5 }, eqMove)).toBeNull();
  });

  it('rejects any move once the game is over', () => {
    const rules = countRules(2);
    expect(tryMove(rules, { value: 2, target: 2 }, { step: 1 }, eqMove)).toBeNull();
  });
});
