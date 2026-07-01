/**
 * Ludo bot — the turn-based `decideMove` reserved for board games.
 *
 * It scores each legal move and, dosed by the shared {@link Difficulty}, either
 * plays the best one or a random one (reusing `bot/difficulty.ts`'s `rollChase`,
 * exactly like the real-time bots vary how often they play "smart"):
 *  - `easy`   : always a random legal move;
 *  - `medium` : the best move ~55% of the time, otherwise random;
 *  - `hard`   : always the best move.
 *
 * Move value (pure, from simulating the move): capturing an opponent ≫ finishing
 * a horse > leaving the stable > raw progress. Good enough to feel like a real
 * opponent without a full search.
 */

import { Difficulty, rollChase } from '../shared/bot/difficulty.js';
import { LudoState, LudoMove, STABLE, FINISH, destination, applyMove } from './ludo.js';

/** How many opponent horses the seat sends home by playing `move`. */
function capturedCount(before: LudoState, after: LudoState, seat: number): number {
  let n = 0;
  for (let s = 0; s < before.pawns.length; s++) {
    if (s === seat) continue;
    for (let p = 0; p < before.pawns[s].length; p++) {
      if (before.pawns[s][p] !== STABLE && after.pawns[s][p] === STABLE) n++;
    }
  }
  return n;
}

/** A heuristic score for one legal move (higher = better). */
export function scoreMove(state: LudoState, move: LudoMove): number {
  const seat = state.current;
  const from = state.pawns[seat][move.pawn];
  const dest = destination(state, seat, move.pawn, state.die ?? 0) ?? 0;
  const after = applyMove(state, move);
  let score = dest; // raw progress along the path
  score += capturedCount(state, after, seat) * 100; // capturing is huge
  if (dest === FINISH) score += 60; // bringing a horse home
  if (from === STABLE) score += 30; // getting another horse into play
  return score;
}

/** The best-scoring move (first one wins ties, kept deterministic). */
function bestMove(state: LudoState, moves: LudoMove[]): LudoMove {
  let best = moves[0];
  let bestScore = scoreMove(state, best);
  for (let i = 1; i < moves.length; i++) {
    const s = scoreMove(state, moves[i]);
    if (s > bestScore) {
      best = moves[i];
      bestScore = s;
    }
  }
  return best;
}

/**
 * Picks the move the bot plays among the (non-empty) legal moves.
 *
 * @param rng Random source in [0, 1) — injectable for deterministic tests.
 */
export function decideMove(
  state: LudoState,
  moves: LudoMove[],
  difficulty: Difficulty,
  rng: () => number = Math.random
): LudoMove {
  if (rollChase(difficulty, rng)) return bestMove(state, moves);
  return moves[Math.floor(rng() * moves.length)];
}
