/**
 * Ludo (known in French as "petits chevaux") — pure rules (no DOM, no
 * randomness, no time), so the whole game logic is unit-testable in isolation.
 * Plugs into the generic turn-based engine (`shared/turn/turnGame.ts`) as a
 * {@link TurnRules}; the controller (`LudoGame`) owns the dice rolls and the
 * on-screen animation.
 *
 * Standard "most people" rules (variants will later be opt-in settings):
 *  - 4 seats × 4 horses, each starting in its stable.
 *  - A horse leaves the stable only on a rolled **6**, onto its start cell.
 *  - Rolling a **6** lets the same seat roll again.
 *  - A horse advances by the die along the shared 52-cell ring, then turns into
 *    its own 6-cell home column; the last home cell (the centre) is "finished".
 *  - Landing **exactly** on an opponent sends that horse back to its stable;
 *    you may **never** land on your own horse (that move is illegal — play
 *    another horse, or pass if none can move).
 *  - The **exact** count is required to finish (no overshoot).
 *  - First seat to bring all 4 horses home wins.
 *
 * Dice handling: the rolled value lives in `state.die` (set by the controller
 * via {@link applyRoll}); `die === null` means "this seat must roll first". This
 * keeps {@link applyMove} deterministic — the only randomness, the roll, stays
 * in the controller where an injectable rng makes it testable too.
 */

import { Seat, TurnRules, nextSeat } from '../shared/turn/turnGame.js';

export const SEATS = 4;
export const PAWNS = 4;
/** Shared ring cells (the cross loop). */
export const RING = 52;
/** Ring cells a horse traverses before turning into its home column. */
export const RING_TRAVEL = 51;
/** Home-column cells, the last one being the centre. */
export const HOME = 6;

/** Distance markers along a horse's personal path. */
export const STABLE = -1;
/** Distance of the centre cell — a finished horse. */
export const FINISH = RING_TRAVEL + HOME - 1; // 56
/** Ring cell where a given seat enters (and where its horses come out). */
export function entryCell(seat: Seat): number {
  return seat * (RING / SEATS); // 0, 13, 26, 39
}

/** Board state: each seat's four horse distances, plus turn bookkeeping. */
export interface LudoState {
  /** `pawns[seat][horse]` = distance travelled (STABLE..FINISH). */
  pawns: number[][];
  current: Seat;
  /** The rolled die awaiting a move, or `null` when the seat must still roll. */
  die: number | null;
  winner: Seat | null;
}

/** A move: advance horse #`pawn` of the current seat by the current die. */
export interface LudoMove {
  pawn: number;
}

export const eqMove = (a: LudoMove, b: LudoMove): boolean => a.pawn === b.pawn;

const isStable = (d: number): boolean => d === STABLE;
const isFinished = (d: number): boolean => d >= FINISH;
const onRing = (d: number): boolean => d >= 0 && d < RING_TRAVEL;

/** Absolute ring cell of a horse at distance `d` for `seat`, or null off-ring. */
function ringIndexAt(seat: Seat, d: number): number | null {
  return onRing(d) ? (entryCell(seat) + d) % RING : null;
}

/**
 * Where horse #`pawn` would land for the given die, or `null` if the move is
 * impossible (stuck in stable without a 6, overshooting the centre, or landing
 * on one of the seat's own horses).
 */
export function destination(
  state: LudoState,
  seat: Seat,
  pawn: number,
  die: number
): number | null {
  const d = state.pawns[seat][pawn];
  if (isFinished(d)) return null;
  const dest = isStable(d) ? (die === 6 ? 0 : null) : d + die;
  if (dest === null || dest > FINISH) return null;
  if (blockedByOwn(state, seat, pawn, dest)) return null;
  return dest;
}

/** Whether another of the seat's own horses already occupies `dest`. */
function blockedByOwn(state: LudoState, seat: Seat, pawn: number, dest: number): boolean {
  if (dest === FINISH) return false; // every horse ends up stacked on the centre
  const destRing = ringIndexAt(seat, dest);
  return state.pawns[seat].some((d, i) => {
    if (i === pawn) return false;
    if (!onRing(dest)) return d === dest; // same single-file home cell
    return ringIndexAt(seat, d) === destRing;
  });
}

/** Builds the initial game: every horse in its stable, seat 0 to roll. */
export function initialState(): LudoState {
  return {
    pawns: Array.from({ length: SEATS }, () => Array.from({ length: PAWNS }, () => STABLE)),
    current: 0,
    die: null,
    winner: null,
  };
}

/** Sets the die the current seat just rolled (controller-only, pure). */
export function applyRoll(state: LudoState, die: number): LudoState {
  return { ...state, die };
}

/** True when the current seat must roll before it can move. */
export function needsRoll(state: LudoState): boolean {
  return state.winner === null && state.die === null;
}

/** Passes the turn to the next seat with no move (no legal move available). */
export function passTurn(state: LudoState): LudoState {
  return { ...state, current: nextSeat(state.current, SEATS), die: null };
}

/** The horses of the current seat that can legally move with the current die. */
export function legalMoves(state: LudoState): LudoMove[] {
  if (state.die === null || state.winner !== null) return [];
  const seat = state.current;
  const moves: LudoMove[] = [];
  for (let pawn = 0; pawn < PAWNS; pawn++) {
    if (destination(state, seat, pawn, state.die) !== null) moves.push({ pawn });
  }
  return moves;
}

/** Applies a (legal) move: advances the horse, captures, then hands the turn. */
export function applyMove(state: LudoState, move: LudoMove): LudoState {
  const die = state.die ?? 0;
  const seat = state.current;
  const dest = destination(state, seat, move.pawn, die);
  // Clone the pawn grid so the input state is never mutated.
  const pawns = state.pawns.map((row) => row.slice());
  if (dest !== null) {
    pawns[seat][move.pawn] = dest;
    // Capture: any opponent horse sharing the landed ring cell goes home.
    const landedRing = ringIndexAt(seat, dest);
    if (landedRing !== null) {
      for (let s = 0; s < SEATS; s++) {
        if (s === seat) continue;
        for (let p = 0; p < PAWNS; p++) {
          if (ringIndexAt(s, pawns[s][p]) === landedRing) pawns[s][p] = STABLE;
        }
      }
    }
  }
  const won = pawns[seat].every(isFinished) ? seat : null;
  // A 6 lets the same seat roll again; otherwise the turn moves on.
  const current = won !== null || die === 6 ? seat : nextSeat(seat, SEATS);
  return { pawns, current, die: null, winner: won };
}

/** The full rule set wired for the generic turn engine. */
export const rules: TurnRules<LudoState, LudoMove> = {
  seats: SEATS,
  initialState,
  currentSeat: (s) => s.current,
  legalMoves,
  applyMove,
  winner: (s) => s.winner,
};
