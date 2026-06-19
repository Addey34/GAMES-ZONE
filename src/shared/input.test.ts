import { describe, expect, it } from 'vitest';
import {
  DIRECTION_DELTAS,
  OPPOSITE_DIRECTION,
  keyboardDirection,
  type Direction,
} from './input.js';

describe('keyboardDirection', () => {
  it('maps the arrow keys to directions', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowUp' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe('down');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe('left');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe('right');
  });

  it('maps the WASD keys to directions', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'w' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 's' }))).toBe('down');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'a' }))).toBe('left');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'd' }))).toBe('right');
  });

  it('maps the ZQSD (AZERTY) keys to directions', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'z' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 's' }))).toBe('down');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'q' }))).toBe('left');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'd' }))).toBe('right');
  });

  it('ignores case (Shift / Caps Lock)', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'Z' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'D' }))).toBe('right');
  });

  it('returns null for an unhandled key', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'Enter' }))).toBeNull();
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'x' }))).toBeNull();
  });
});

describe('direction tables', () => {
  const directions: Direction[] = ['up', 'down', 'left', 'right'];

  it('each opposite is reciprocal', () => {
    for (const d of directions) {
      expect(OPPOSITE_DIRECTION[OPPOSITE_DIRECTION[d]]).toBe(d);
    }
  });

  it('the opposite direction delta is the inverse vector', () => {
    for (const d of directions) {
      const delta = DIRECTION_DELTAS[d];
      const opposite = DIRECTION_DELTAS[OPPOSITE_DIRECTION[d]];
      // delta + opposite must cancel out (avoids the -0 ≠ 0 pitfall of Object.is).
      expect(delta.x + opposite.x).toBe(0);
      expect(delta.y + opposite.y).toBe(0);
    }
  });
});
