import { describe, it, expect } from 'vitest';
import { rememberCard, findKnownPair, pickFirst, pickSecond, botPlaysSmart } from './memoryBot.js';

describe('rememberCard', () => {
  it('memorises when the roll is under the retention', () => {
    const memory = new Map<number, string>();
    rememberCard(memory, 3, 'star', 'hard', () => 0.1); // 0.1 < 0.8 → kept
    expect(memory.get(3)).toBe('star');
  });

  it('can forget even on hard (roll above retention)', () => {
    const memory = new Map<number, string>();
    rememberCard(memory, 3, 'star', 'hard', () => 0.95); // 0.95 >= 0.8 → forgotten
    expect(memory.has(3)).toBe(false);
  });
});

describe('botPlaysSmart', () => {
  it('plays dumb when the roll exceeds the difficulty skill', () => {
    expect(botPlaysSmart('hard', () => 0.99)).toBe(false); // 0.99 >= 0.85
    expect(botPlaysSmart('easy', () => 0.5)).toBe(false); // 0.5 >= 0.4
  });

  it('plays smart when the roll is under the skill', () => {
    expect(botPlaysSmart('hard', () => 0.1)).toBe(true);
  });
});

describe('findKnownPair', () => {
  it('finds two hidden indices sharing a remembered symbol', () => {
    const memory = new Map([
      [0, 'star'],
      [5, 'moon'],
      [8, 'star'],
    ]);
    expect(findKnownPair(memory, new Set([0, 5, 8]))).toEqual([0, 8]);
  });

  it('ignores cards no longer hidden (already matched)', () => {
    const memory = new Map([
      [0, 'star'],
      [8, 'star'],
    ]);
    // 8 is no longer hidden → no completable pair.
    expect(findKnownPair(memory, new Set([0, 1, 2]))).toBeNull();
  });
});

describe('pickFirst', () => {
  it('prefers an unknown hidden card over a remembered one', () => {
    const memory = new Map([[0, 'star']]);
    // hidden 0 (known) and 1,2 (unknown) → must pick among unknowns.
    const pick = pickFirst(memory, [0, 1, 2], () => 0);
    expect(pick).toBe(1);
  });
});

describe('pickSecond', () => {
  it('completes the pair when the matching card is remembered', () => {
    const memory = new Map([[7, 'moon']]);
    // first card revealed 'moon'; the bot remembers 7 is 'moon' → pick 7.
    expect(pickSecond(memory, [2, 7, 9], 2, 'moon')).toBe(7);
  });

  it('explores an unknown card when no match is known', () => {
    const memory = new Map([[2, 'moon']]);
    const pick = pickSecond(memory, [2, 5, 6], 2, 'moon', () => 0);
    expect([5, 6]).toContain(pick);
  });
});
