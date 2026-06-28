import { Vec2 } from '../engine/input.js';

/**
 * Manhattan (grid) distance between two cells: the number of orthogonal steps.
 *
 * The natural metric for grid-pursuit bots (movement is up/down/left/right, no
 * diagonals), and a cheap heuristic for board evaluations later on.
 */
export function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
