import { describe, expect, it } from 'vitest';
import { buildScoreMetadata, recordToScoreEntry, googleTokenName } from './nakama.js';
import { ScoreEntry } from '../score/ScoreManager.js';

/** A score entry enriched like Dactylographie's (extra typing metrics). */
interface TypingEntry extends ScoreEntry {
  wpm: number;
  lpm: number;
  letters: number;
}

/** Builds an unpadded base64url JWT (only the payload matters here). */
function makeJwt(payload: object): string {
  const encode = (obj: object): string =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
}

describe('buildScoreMetadata', () => {
  it('keeps username and game-specific extras but drops score and date', () => {
    const entry: TypingEntry = {
      username: 'Alice',
      score: 250,
      date: new Date('2026-06-27T00:00:00Z'),
      wpm: 42,
      lpm: 210,
      letters: 350,
    };
    expect(buildScoreMetadata(entry)).toEqual({
      username: 'Alice',
      wpm: 42,
      lpm: 210,
      letters: 350,
    });
  });

  it('reduces to just the username for a plain entry', () => {
    expect(buildScoreMetadata({ username: 'Bob', score: 10, date: new Date() })).toEqual({
      username: 'Bob',
    });
  });
});

describe('recordToScoreEntry', () => {
  it('prefers metadata.username, parses score, and restores extras', () => {
    const entry = recordToScoreEntry({
      score: 250,
      username: 'auto-generated-id',
      metadata: { username: 'Alice', wpm: 42 },
      update_time: '2026-06-27T00:00:00Z',
    });
    expect(entry.username).toBe('Alice');
    expect(entry.score).toBe(250);
    expect((entry as unknown as { wpm?: number }).wpm).toBe(42);
    expect(entry.date).toBeInstanceOf(Date);
  });

  it('falls back to the record username when metadata has none', () => {
    expect(recordToScoreEntry({ score: 10, username: 'Bob', metadata: {} }).username).toBe('Bob');
  });

  it('defaults username to "Joueur" and score to 0 when absent', () => {
    const entry = recordToScoreEntry({});
    expect(entry.username).toBe('Joueur');
    expect(entry.score).toBe(0);
    expect(entry.date).toBeUndefined();
  });
});

describe('googleTokenName', () => {
  it('reads the name claim', () => {
    expect(googleTokenName(makeJwt({ name: 'Alice', email: 'a@b.co' }))).toBe('Alice');
  });

  it('falls back to the email when there is no name', () => {
    expect(googleTokenName(makeJwt({ email: 'a@b.co' }))).toBe('a@b.co');
  });

  it('returns undefined for a malformed token', () => {
    expect(googleTokenName('not-a-jwt')).toBeUndefined();
    expect(googleTokenName('')).toBeUndefined();
  });
});
