import { describe, it, expect } from 'vitest';
import {
  LudoState,
  initialState,
  applyRoll,
  legalMoves,
  applyMove,
  passTurn,
  needsRoll,
  destination,
  STABLE,
  FINISH,
} from './ludo.js';

/** initialState then the given overrides, for compact test setups. */
function state(over: Partial<LudoState> = {}): LudoState {
  return { ...initialState(), ...over };
}

describe('initial state & rolling', () => {
  it('starts with every horse in its stable, seat 0 to roll', () => {
    const s = initialState();
    expect(s.pawns.flat().every((d) => d === STABLE)).toBe(true);
    expect(s.current).toBe(0);
    expect(needsRoll(s)).toBe(true);
  });

  it('offers no move until the seat has rolled', () => {
    expect(legalMoves(initialState())).toEqual([]);
  });
});

describe('leaving the stable', () => {
  it('is impossible without a 6', () => {
    expect(legalMoves(applyRoll(state(), 3))).toEqual([]);
  });

  it('brings a horse out onto the start cell on a 6, and lets the seat roll again', () => {
    const s = applyMove(applyRoll(state(), 6), { pawn: 0 });
    expect(s.pawns[0][0]).toBe(0);
    expect(s.current).toBe(0); // a 6 rolls again
    expect(needsRoll(s)).toBe(true);
  });
});

describe('moving and turn order', () => {
  it('advances a horse by the die and hands the turn on a non-6', () => {
    const s = applyMove(applyRoll(state({ pawns: pawnsWith({ 0: [0] }) }), 4), { pawn: 0 });
    expect(s.pawns[0][0]).toBe(4);
    expect(s.current).toBe(1);
  });

  it('passes the turn when no horse can move', () => {
    expect(passTurn(state()).current).toBe(1);
  });
});

describe('capture', () => {
  it('sends an opponent landed on exactly back to its stable', () => {
    // Seat 0 horse at distance 10 (cell 10); seat 1 horse at its start (cell 13).
    const s = state({ die: 3, pawns: pawnsWith({ 0: [10], 1: [0] }) });
    const after = applyMove(s, { pawn: 0 });
    expect(after.pawns[0][0]).toBe(13); // 0's horse on cell 13
    expect(after.pawns[1][0]).toBe(STABLE); // 1's horse captured
  });
});

describe('own horses never stack', () => {
  it('forbids landing on your own horse, leaving the other horse playable', () => {
    const s = state({ die: 3, pawns: pawnsWith({ 0: [10, 13] }) }); // cells 10 & 13
    const moves = legalMoves(s);
    expect(moves.some((m) => m.pawn === 0)).toBe(false); // 10 -> 13 blocked by own
    expect(moves.some((m) => m.pawn === 1)).toBe(true);
  });
});

describe('finishing', () => {
  it('requires the exact count (no overshoot of the centre)', () => {
    const s = state({ pawns: pawnsWith({ 0: [54] }) }); // 2 from the centre
    expect(destination(s, 0, 0, 3)).toBeNull(); // would overshoot
    expect(destination(s, 0, 0, 2)).toBe(FINISH); // lands exactly
  });

  it('declares the winner once all four horses are home', () => {
    const s = state({ die: 2, pawns: pawnsWith({ 0: [FINISH, FINISH, FINISH, 54] }) });
    const after = applyMove(s, { pawn: 3 });
    expect(after.winner).toBe(0);
  });
});

/** Builds a pawns grid, all STABLE except the seats/horses given. */
function pawnsWith(seats: Record<number, number[]>): number[][] {
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => STABLE));
  for (const [seat, ds] of Object.entries(seats)) {
    ds.forEach((d, i) => (grid[Number(seat)][i] = d));
  }
  return grid;
}
