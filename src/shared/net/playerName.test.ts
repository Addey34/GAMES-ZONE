import { afterEach, describe, expect, it } from 'vitest';
import { getPlayerName, hasPlayerName, setPlayerName } from './playerName.js';

afterEach(() => {
  localStorage.clear();
});

describe('playerName', () => {
  it('reports no name initially', () => {
    expect(getPlayerName()).toBeNull();
    expect(hasPlayerName()).toBe(false);
  });

  it('stores and reads back a trimmed name', () => {
    setPlayerName('  Adrian  ');
    expect(getPlayerName()).toBe('Adrian');
    expect(hasPlayerName()).toBe(true);
  });

  it('caps the name length', () => {
    setPlayerName('x'.repeat(40));
    expect(getPlayerName()).toHaveLength(20);
  });

  it('ignores an empty or whitespace-only name', () => {
    setPlayerName('   ');
    expect(getPlayerName()).toBeNull();
  });
});
