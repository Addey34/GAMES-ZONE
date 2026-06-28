import { Difficulty } from './difficulty.js';

/**
 * Memory (matching-pairs) opponent bot — pure decision logic, no DOM.
 *
 * The bot keeps a `memory` map (card index → symbol) of cards it has retained.
 * Difficulty tunes a single knob: the probability it actually memorises a card
 * it sees revealed (its own flips and the human's). `easy` forgets a lot, `hard`
 * remembers everything — so a harder bot exploits known pairs more often. The
 * move itself is then "optimal given what it remembers", which is the natural,
 * human-like strategy.
 */

/**
 * Probability the bot memorises a revealed card, per difficulty. Kept below 1
 * even on `hard` so the bot has memory gaps the player can exploit — every tier
 * stays beatable (a near-perfect bot would be a future "extreme"/"impossible").
 */
export const MEMORY_RETENTION: Record<Difficulty, number> = {
  easy: 0.35,
  medium: 0.55,
  hard: 0.8,
};

/**
 * Probability the bot actually *uses* its memory on a given turn (vs. playing a
 * dumb random move). The second beatability knob: even `hard` occasionally
 * "forgets to think", giving the player openings.
 */
export const MEMORY_SKILL: Record<Difficulty, number> = {
  easy: 0.4,
  medium: 0.65,
  hard: 0.85,
};

/** Rolls whether the bot plays a smart (memory-using) move this turn. */
export function botPlaysSmart(difficulty: Difficulty, rng: () => number = Math.random): boolean {
  return rng() < MEMORY_SKILL[difficulty];
}

/**
 * Records a revealed card into the bot's memory with the difficulty's retention
 * probability (so an easy bot routinely forgets). Mutates `memory`.
 */
export function rememberCard(
  memory: Map<number, string>,
  index: number,
  symbol: string,
  difficulty: Difficulty,
  rng: () => number = Math.random
): void {
  if (rng() < MEMORY_RETENTION[difficulty]) memory.set(index, symbol);
}

/**
 * Returns a known matching pair (two still-hidden indices sharing a symbol the
 * bot remembers), or null if it knows of none.
 */
export function findKnownPair(
  memory: Map<number, string>,
  hidden: ReadonlySet<number>
): [number, number] | null {
  const bySymbol = new Map<string, number>();
  for (const [index, symbol] of memory) {
    if (!hidden.has(index)) continue;
    const seen = bySymbol.get(symbol);
    if (seen !== undefined) return [seen, index];
    bySymbol.set(symbol, index);
  }
  return null;
}

/**
 * Picks the first card to flip when no known pair exists: prefers an unknown
 * hidden card (to gain information), falling back to any hidden card.
 */
export function pickFirst(
  memory: Map<number, string>,
  hidden: number[],
  rng: () => number = Math.random
): number {
  const unknown = hidden.filter((index) => !memory.has(index));
  const pool = unknown.length ? unknown : hidden;
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Picks the second card after the first is revealed: if the bot remembers another
 * hidden card with the same symbol, it completes the pair; otherwise it explores
 * an unknown card (falling back to any remaining hidden one).
 */
export function pickSecond(
  memory: Map<number, string>,
  hidden: number[],
  firstIndex: number,
  firstSymbol: string,
  rng: () => number = Math.random
): number {
  for (const [index, symbol] of memory) {
    if (index !== firstIndex && symbol === firstSymbol && hidden.includes(index)) {
      return index;
    }
  }
  const rest = hidden.filter((index) => index !== firstIndex);
  const unknown = rest.filter((index) => !memory.has(index));
  const pool = unknown.length ? unknown : rest;
  return pool[Math.floor(rng() * pool.length)];
}
