import { describe, it, expect } from 'vitest';
import { manhattan } from './distance.js';

describe('manhattan', () => {
  it('is zero for identical cells', () => {
    expect(manhattan({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
  });

  it('sums the orthogonal steps between two cells', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  it('ignores direction (uses absolute differences)', () => {
    expect(manhattan({ x: 5, y: 2 }, { x: 1, y: 6 })).toBe(8);
    expect(manhattan({ x: 1, y: 6 }, { x: 5, y: 2 })).toBe(8);
  });

  it('handles negative coordinates', () => {
    expect(manhattan({ x: -2, y: -3 }, { x: 1, y: 1 })).toBe(7);
  });

  it('is symmetric', () => {
    const a = { x: 7, y: -1 };
    const b = { x: -4, y: 5 };
    expect(manhattan(a, b)).toBe(manhattan(b, a));
  });
});
