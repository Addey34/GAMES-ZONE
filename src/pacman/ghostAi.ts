import { Direction, Vec2, DIRECTION_DELTAS } from '../shared/input.js';
import { Difficulty, rollChase } from '../shared/bot/difficulty.js';
import { manhattan } from '../shared/bot/distance.js';

/**
 * Ghost AI for Pac-Man — the game's first parameterizable bot.
 *
 * Pure decision logic (no DOM, no game loop): given a ghost, its legal moves and
 * the current board context, it returns the direction to take. Difficulty tunes
 * how often the ghost actually pursues versus wandering at random (see
 * {@link Difficulty}); at `easy` it reproduces the original purely-random ghosts.
 *
 * Each ghost has a personality borrowed from the arcade original, differing only
 * in which tile it steers toward — that variety is what makes the chase feel alive.
 */

/** Context the personalities use to pick the tile a ghost aims at. */
export interface ChaseContext {
  ghost: Vec2;
  pacman: Vec2;
  /** Direction Pac-Man is currently facing (used to aim ahead of him). */
  pacmanDir: Direction;
}

/** A ghost's targeting behaviour. */
export interface GhostPersonality {
  name: 'blinky' | 'pinky' | 'clyde';
  /** The tile this ghost steers toward in the current context. */
  target(ctx: ChaseContext): Vec2;
}

/** How far ahead of Pac-Man Pinky aims (in cells). */
const PINKY_LEAD = 4;
/** Beyond this distance Clyde chases; closer, he backs off to his corner. */
const CLYDE_SHY_DISTANCE = 8;
/** Clyde's scatter corner (bottom-left walkable area of the maze). */
const CLYDE_CORNER: Vec2 = { x: 1, y: 16 };

/**
 * The three personalities, indexed to match the three ghosts created by the game.
 *
 * - **Blinky** chases Pac-Man's exact tile (sticks to you).
 * - **Pinky** aims a few tiles ahead of Pac-Man (tries to ambush).
 * - **Clyde** chases when far but retreats to his corner when close (skittish).
 */
export const GHOST_PERSONALITIES: GhostPersonality[] = [
  {
    name: 'blinky',
    target: ({ pacman }) => pacman,
  },
  {
    name: 'pinky',
    target: ({ pacman, pacmanDir }) => {
      const lead = DIRECTION_DELTAS[pacmanDir];
      return { x: pacman.x + lead.x * PINKY_LEAD, y: pacman.y + lead.y * PINKY_LEAD };
    },
  },
  {
    name: 'clyde',
    target: ({ ghost, pacman }) =>
      manhattan(ghost, pacman) > CLYDE_SHY_DISTANCE ? pacman : CLYDE_CORNER,
  },
];

/**
 * Picks the direction a ghost should take this step.
 *
 * @param validDirs Moves already filtered by the caller (no walls, and no U-turn
 *   unless it is the only way out).
 * @param personality The ghost's targeting behaviour.
 * @param difficulty Tunes pursuit vs. random wandering.
 * @param rng Random source in [0, 1) — injectable for deterministic tests.
 * @returns The chosen direction (always one of `validDirs`).
 */
export function chooseGhostDirection(
  validDirs: Direction[],
  ctx: ChaseContext,
  personality: GhostPersonality,
  difficulty: Difficulty,
  rng: () => number = Math.random
): Direction {
  // Wander randomly when not pursuing (always so at `easy`).
  if (!rollChase(difficulty, rng)) {
    return validDirs[Math.floor(rng() * validDirs.length)];
  }

  // Pursue: head for the tile that gets us closest to this ghost's target.
  const target = personality.target(ctx);
  let best = validDirs[0];
  let bestDist = Infinity;
  for (const dir of validDirs) {
    const delta = DIRECTION_DELTAS[dir];
    const next = { x: ctx.ghost.x + delta.x, y: ctx.ghost.y + delta.y };
    const dist = manhattan(next, target);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}
