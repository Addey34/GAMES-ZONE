import { describe, expect, it } from 'vitest';
import {
  DIRECTION_DELTAS,
  OPPOSITE_DIRECTION,
  keyboardDirection,
  type Direction,
} from './input.js';

describe('keyboardDirection', () => {
  it('mappe les flèches vers les directions', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowUp' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe('down');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))).toBe('left');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'ArrowRight' }))).toBe('right');
  });

  it('mappe les touches WASD vers les directions', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'w' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 's' }))).toBe('down');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'a' }))).toBe('left');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'd' }))).toBe('right');
  });

  it('mappe les touches ZQSD (AZERTY) vers les directions', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'z' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 's' }))).toBe('down');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'q' }))).toBe('left');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'd' }))).toBe('right');
  });

  it('ignore la casse (Maj / Verr. Maj)', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'Z' }))).toBe('up');
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'D' }))).toBe('right');
  });

  it('renvoie null pour une touche non gérée', () => {
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'Enter' }))).toBeNull();
    expect(keyboardDirection(new KeyboardEvent('keydown', { key: 'x' }))).toBeNull();
  });
});

describe('tables de directions', () => {
  const directions: Direction[] = ['up', 'down', 'left', 'right'];

  it('chaque opposé est réciproque', () => {
    for (const d of directions) {
      expect(OPPOSITE_DIRECTION[OPPOSITE_DIRECTION[d]]).toBe(d);
    }
  });

  it('le delta de la direction opposée est le vecteur inverse', () => {
    for (const d of directions) {
      const delta = DIRECTION_DELTAS[d];
      const opposite = DIRECTION_DELTAS[OPPOSITE_DIRECTION[d]];
      // delta + opposé doit s'annuler (évite le piège -0 ≠ 0 de Object.is).
      expect(delta.x + opposite.x).toBe(0);
      expect(delta.y + opposite.y).toBe(0);
    }
  });
});
