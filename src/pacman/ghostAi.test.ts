import { describe, it, expect } from 'vitest';
import { Direction, Vec2 } from '../shared/input.js';
import { manhattan } from '../shared/bot/distance.js';
import { chooseGhostDirection, GHOST_PERSONALITIES, ChaseContext } from './ghostAi.js';

const [BLINKY, PINKY, CLYDE] = GHOST_PERSONALITIES;

/** Deterministic RNG always returning `value` (drives the chase/random roll). */
const constRng = (value: number) => () => value;

describe('ghost personalities', () => {
  it('Blinky targets Pac-Man directly', () => {
    const ctx: ChaseContext = { ghost: { x: 0, y: 0 }, pacman: { x: 5, y: 7 }, pacmanDir: 'up' };
    expect(BLINKY.target(ctx)).toEqual({ x: 5, y: 7 });
  });

  it('Pinky aims four tiles ahead of Pac-Man', () => {
    const ctx: ChaseContext = { ghost: { x: 0, y: 0 }, pacman: { x: 5, y: 7 }, pacmanDir: 'left' };
    expect(PINKY.target(ctx)).toEqual({ x: 1, y: 7 });
  });

  it('Clyde chases when far but retreats to his corner when close', () => {
    const far: ChaseContext = { ghost: { x: 19, y: 1 }, pacman: { x: 5, y: 7 }, pacmanDir: 'up' };
    expect(CLYDE.target(far)).toEqual({ x: 5, y: 7 });

    const near: ChaseContext = { ghost: { x: 5, y: 8 }, pacman: { x: 5, y: 7 }, pacmanDir: 'up' };
    const corner = CLYDE.target(near);
    expect(corner).not.toEqual({ x: 5, y: 7 });
  });
});

describe('chooseGhostDirection', () => {
  const ctx: ChaseContext = { ghost: { x: 5, y: 5 }, pacman: { x: 5, y: 0 }, pacmanDir: 'up' };
  const valid: Direction[] = ['up', 'down', 'left', 'right'];

  it('hard mode picks the move that reduces distance to the target', () => {
    // Pac-Man is straight up; Blinky should head 'up'.
    const dir = chooseGhostDirection(valid, ctx, BLINKY, 'hard', constRng(0));
    expect(dir).toBe('up');
  });

  it('the chosen pursuit move actually gets closer to the target', () => {
    const dir = chooseGhostDirection(valid, ctx, BLINKY, 'hard', constRng(0));
    const before = manhattan(ctx.ghost, ctx.pacman);
    const delta: Record<Direction, Vec2> = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const after = manhattan(
      { x: ctx.ghost.x + delta[dir].x, y: ctx.ghost.y + delta[dir].y },
      ctx.pacman
    );
    expect(after).toBeLessThan(before);
  });

  it('easy mode never pursues: it stays within the legal moves', () => {
    // rng=0 forces the random branch (rollChase false at easy) AND indexes valid[0].
    const dir = chooseGhostDirection(valid, ctx, BLINKY, 'easy', constRng(0));
    expect(valid).toContain(dir);
    expect(dir).toBe('up'); // valid[Math.floor(0 * len)] === valid[0]
  });

  it('always returns one of the provided legal moves', () => {
    const onlyDown: Direction[] = ['down'];
    expect(chooseGhostDirection(onlyDown, ctx, BLINKY, 'hard', constRng(0))).toBe('down');
    expect(chooseGhostDirection(onlyDown, ctx, BLINKY, 'easy', constRng(0))).toBe('down');
  });
});
