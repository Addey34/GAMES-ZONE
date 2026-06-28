import { afterEach, describe, expect, it } from 'vitest';
import {
  LevelsConfig,
  defaultProgress,
  highestUnlocked,
  isLevelUnlocked,
  loadLocalProgress,
} from './levels.js';

afterEach(() => {
  localStorage.clear();
});

describe('defaultProgress', () => {
  it('starts with nothing cleared and level 1 selected', () => {
    expect(defaultProgress()).toEqual({ cleared: 0, bestScore: 0, selected: 1 });
  });
});

describe('isLevelUnlocked', () => {
  const progress = { cleared: 3, bestScore: 120, selected: 1 };

  it('always unlocks an "open" level', () => {
    expect(isLevelUnlocked({ id: 27, unlock: { type: 'open' } }, defaultProgress())).toBe(true);
  });

  it('unlocks a sequential level only up to the next uncleared one', () => {
    // cleared = 3 → levels 1..4 available, 5+ locked.
    expect(isLevelUnlocked({ id: 4, unlock: { type: 'sequential' } }, progress)).toBe(true);
    expect(isLevelUnlocked({ id: 5, unlock: { type: 'sequential' } }, progress)).toBe(false);
  });

  it('treats a missing rule as sequential', () => {
    expect(isLevelUnlocked({ id: 4 }, progress)).toBe(true);
    expect(isLevelUnlocked({ id: 5 }, progress)).toBe(false);
  });

  it('unlocks a score-gated level once the best score reaches the threshold', () => {
    expect(isLevelUnlocked({ id: 9, unlock: { type: 'score', threshold: 120 } }, progress)).toBe(
      true
    );
    expect(isLevelUnlocked({ id: 9, unlock: { type: 'score', threshold: 121 } }, progress)).toBe(
      false
    );
  });

  it('always makes the first sequential level reachable', () => {
    expect(isLevelUnlocked({ id: 1, unlock: { type: 'sequential' } }, defaultProgress())).toBe(
      true
    );
  });
});

describe('highestUnlocked', () => {
  const config: LevelsConfig = {
    gameKey: 'test',
    levels: [
      { id: 1, unlock: { type: 'open' } },
      { id: 2, unlock: { type: 'sequential' } },
      { id: 3, unlock: { type: 'sequential' } },
      { id: 10, unlock: { type: 'open' } }, // a "rare" pre-opened checkpoint
    ],
  };

  it('counts open levels even when sequential ones are still locked', () => {
    expect(highestUnlocked(config, defaultProgress())).toBe(10);
  });

  it('rises as levels are cleared', () => {
    expect(highestUnlocked(config, { cleared: 2, bestScore: 0, selected: 1 })).toBe(10);
  });
});

describe('loadLocalProgress', () => {
  it('returns the default when nothing is stored', () => {
    expect(loadLocalProgress('pacman')).toEqual(defaultProgress());
  });

  it('reads and completes a partially-stored progress', () => {
    localStorage.setItem('gz-levels-pacman', JSON.stringify({ cleared: 5 }));
    expect(loadLocalProgress('pacman')).toEqual({ cleared: 5, bestScore: 0, selected: 1 });
  });

  it('falls back to the default on corrupt JSON', () => {
    localStorage.setItem('gz-levels-pacman', '{not json');
    expect(loadLocalProgress('pacman')).toEqual(defaultProgress());
  });
});
