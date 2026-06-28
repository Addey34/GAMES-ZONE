import { describe, it, expect } from 'vitest';
import { CHASE_CHANCE, rollChase } from './difficulty.js';

describe('CHASE_CHANCE', () => {
  it('maps easy to fully random and hard to always chasing', () => {
    expect(CHASE_CHANCE.easy).toBe(0);
    expect(CHASE_CHANCE.hard).toBe(1);
  });

  it('keeps medium strictly between the two extremes', () => {
    expect(CHASE_CHANCE.medium).toBeGreaterThan(CHASE_CHANCE.easy);
    expect(CHASE_CHANCE.medium).toBeLessThan(CHASE_CHANCE.hard);
  });
});

describe('rollChase', () => {
  it('never chases on easy, whatever the roll', () => {
    expect(rollChase('easy', () => 0)).toBe(false);
    expect(rollChase('easy', () => 0.99)).toBe(false);
  });

  it('always chases on hard, whatever the roll', () => {
    expect(rollChase('hard', () => 0)).toBe(true);
    expect(rollChase('hard', () => 0.99)).toBe(true);
  });

  it('chases on medium only when the roll is below the threshold', () => {
    expect(rollChase('medium', () => CHASE_CHANCE.medium - 0.01)).toBe(true);
    expect(rollChase('medium', () => CHASE_CHANCE.medium)).toBe(false);
    expect(rollChase('medium', () => CHASE_CHANCE.medium + 0.01)).toBe(false);
  });

  it('defaults to Math.random and stays within the boolean contract', () => {
    expect(typeof rollChase('medium')).toBe('boolean');
  });
});
