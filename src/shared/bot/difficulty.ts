/**
 * Shared bot difficulty primitives.
 *
 * The single cross-game knob for every AI opponent: rather than coding separate
 * "easy"/"medium"/"hard" bots, a bot keeps one strategy and only varies how often
 * it actually applies it (versus playing randomly). This is the genuinely reusable
 * piece across game families (real-time agents like Pac-Man's ghosts, and later
 * turn-based bots like Connect-4).
 */

/** Difficulty tiers, from harmless to relentless. */
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * Probability that a bot plays its "smart" move rather than a random one.
 *
 * `easy` = 0 → fully random (e.g. Pac-Man's original ghost behaviour).
 * `hard` = 1 → always pursues. `medium` chases often but still slips up.
 */
export const CHASE_CHANCE: Record<Difficulty, number> = {
  easy: 0,
  medium: 0.55,
  hard: 1,
};

/**
 * Rolls whether the bot should play smart this step, given its difficulty.
 *
 * @param difficulty The bot's difficulty tier.
 * @param rng Random source in [0, 1) — injectable for deterministic tests.
 */
export function rollChase(difficulty: Difficulty, rng: () => number = Math.random): boolean {
  return rng() < CHASE_CHANCE[difficulty];
}
