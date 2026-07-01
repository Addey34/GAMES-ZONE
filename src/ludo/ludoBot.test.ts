import { describe, it, expect } from 'vitest';
import { LudoState, initialState, legalMoves, STABLE, FINISH } from './ludo.js';
import { decideMove, scoreMove } from './ludoBot.js';

function state(over: Partial<LudoState> = {}): LudoState {
  return { ...initialState(), ...over };
}

/** Builds a pawns grid, all STABLE except the seats/horses given. */
function pawnsWith(seats: Record<number, number[]>): number[][] {
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => STABLE));
  for (const [seat, ds] of Object.entries(seats)) {
    ds.forEach((d, i) => (grid[Number(seat)][i] = d));
  }
  return grid;
}

describe('scoreMove', () => {
  it('rates a capturing move far above a plain advance', () => {
    // pawn 0: 10 -> 13 captures seat 1 (on cell 13); pawn 1: 20 -> 23 plain.
    const s = state({ die: 3, pawns: pawnsWith({ 0: [10, 20], 1: [0] }) });
    expect(scoreMove(s, { pawn: 0 })).toBeGreaterThan(scoreMove(s, { pawn: 1 }));
  });
});

describe('decideMove', () => {
  it('on hard, takes the capture over a plain advance', () => {
    const s = state({ die: 3, pawns: pawnsWith({ 0: [10, 20], 1: [0] }) });
    expect(decideMove(s, legalMoves(s), 'hard').pawn).toBe(0);
  });

  it('on hard, prefers finishing a horse over advancing another', () => {
    const s = state({ die: 2, pawns: pawnsWith({ 0: [54, 20] }) }); // 54 -> centre
    expect(decideMove(s, legalMoves(s), 'hard').pawn).toBe(0);
  });

  it('on easy, just returns a legal move', () => {
    const s = state({ die: 3, pawns: pawnsWith({ 0: [10, 20] }) });
    const moves = legalMoves(s);
    const chosen = decideMove(s, moves, 'easy', () => 0);
    expect(moves).toContainEqual(chosen);
  });

  it('finishing scores above leaving the stable', () => {
    const finish = state({ die: 2, pawns: pawnsWith({ 0: [54] }) });
    const leave = state({ die: 6, pawns: pawnsWith({ 0: [STABLE] }) });
    expect(scoreMove(finish, { pawn: 0 })).toBeGreaterThan(scoreMove(leave, { pawn: 0 }));
    expect(finish.pawns[0][0]).toBe(54);
    expect(FINISH).toBe(56);
  });
});
