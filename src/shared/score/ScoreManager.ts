/**
 * One entry of a game's leaderboard.
 */
export interface ScoreEntry {
  /** Name entered by the player. */
  username: string;
  /** Score achieved. */
  score: number;
  /** Date the score was achieved (default: now). */
  date?: Date;
  /** Game-specific data (e.g. typing speed for Typing). */
  additionalData?: Record<string, number>;
}

/**
 * Handles the persistence of a leaderboard (top-N) in `localStorage`.
 *
 * Each game instantiates its own `ScoreManager` with a distinct storage key.
 * Scores are kept sorted in descending order and limited to the `maxScores`
 * best ones.
 */
export class ScoreManager {
  private storageKey: string;
  private maxScores: number;

  /**
   * @param storageKey `localStorage` key specific to the game.
   * @param maxScores Maximum number of entries kept in the leaderboard.
   */
  constructor(storageKey: string, maxScores: number = 10) {
    this.storageKey = storageKey;
    this.maxScores = maxScores;
  }

  /**
   * Adds an entry to the leaderboard, re-sorts it by descending score and only
   * keeps the `maxScores` best ones before persisting.
   */
  saveScore(entry: ScoreEntry): void {
    const scores = this.getScores();
    scores.push({
      ...entry,
      date: entry.date || new Date(),
    });

    scores.sort((a, b) => b.score - a.score);

    const topScores = scores.slice(0, this.maxScores);

    localStorage.setItem(this.storageKey, JSON.stringify(topScores));
  }

  /**
   * Reads the persisted leaderboard. Returns an empty array if no data is
   * stored or if the content is unreadable.
   */
  getScores(): ScoreEntry[] {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return [];

    try {
      const parsed: unknown = JSON.parse(stored);
      // The content may be valid JSON but not an array (corrupted data or
      // outdated format): in that case we fall back to an empty leaderboard.
      if (!Array.isArray(parsed)) return [];
      return parsed.map((raw): ScoreEntry => {
        const entry = raw as ScoreEntry;
        return {
          ...entry,
          date: entry.date ? new Date(entry.date) : new Date(),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Returns the best recorded score (0 if the leaderboard is empty).
   */
  getHighScore(): number {
    const scores = this.getScores();
    return scores.length > 0 ? scores[0].score : 0;
  }

  /**
   * Fully clears the persisted leaderboard.
   */
  clearScores(): void {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Tells whether a score deserves to make the leaderboard: true as long as the
   * leaderboard is not full, or if the score beats the last entry.
   */
  isHighScore(score: number): boolean {
    const scores = this.getScores();
    if (scores.length < this.maxScores) return true;
    return score > scores[scores.length - 1].score;
  }
}
