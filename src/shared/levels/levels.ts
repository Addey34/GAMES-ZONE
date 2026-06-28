import { readStorage, writeStorage } from '../net/nakama.js';

/**
 * Game-agnostic level / unlocking model.
 *
 * A game declares an ordered list of {@link LevelDef}s (each carrying its own
 * unlock rule), and the engine drives the rest: it loads the player's
 * {@link LevelProgress} (locally for an instant offline read, then merged with
 * Nakama Storage for cross-device sync), decides what is unlocked, and persists
 * progress as the player advances. The pure helpers below are unit-tested.
 */

/** How a level becomes available to play. */
export type UnlockRule =
  | { type: 'open' } // playable from the start
  | { type: 'sequential' } // unlocked once the previous level has been cleared
  | { type: 'score'; threshold: number }; // unlocked once the best score reaches a threshold

/** One level of a game. */
export interface LevelDef {
  /** 1-based number; also the stable id used in storage and the UI. */
  id: number;
  /** Short label shown in the panel (defaults to the id). */
  label?: string;
  /** How this level unlocks (default: sequential). */
  unlock?: UnlockRule;
}

/** A game's level set, declared by the game and passed to the engine. */
export interface LevelsConfig {
  /** Game key (e.g. 'pacman'); also used to key the stored progress. */
  gameKey: string;
  /** Levels in ascending order. */
  levels: LevelDef[];
}

/** A player's progress for one game. */
export interface LevelProgress {
  /** Highest level number cleared (0 = none yet). */
  cleared: number;
  /** Best score reached on this game (drives score-gated unlocks). */
  bestScore: number;
  /** Last level the player selected (restored on the next visit). */
  selected: number;
}

/** Fresh progress: nothing cleared, level 1 selected. */
export function defaultProgress(): LevelProgress {
  return { cleared: 0, bestScore: 0, selected: 1 };
}

/**
 * Whether a level is unlocked for the given progress. Pure.
 *
 * The first level is always reachable; `sequential` levels open once the
 * previous one is cleared, `score` levels once the best score reaches the
 * threshold, and `open` levels are always available.
 */
export function isLevelUnlocked(level: LevelDef, progress: LevelProgress): boolean {
  const rule = level.unlock ?? { type: 'sequential' };
  switch (rule.type) {
    case 'open':
      return true;
    case 'score':
      return progress.bestScore >= rule.threshold;
    case 'sequential':
      return level.id <= progress.cleared + 1;
  }
}

/** The highest currently-unlocked level number (at least 1). Pure. */
export function highestUnlocked(config: LevelsConfig, progress: LevelProgress): number {
  let max = 1;
  for (const level of config.levels) {
    if (isLevelUnlocked(level, progress)) max = Math.max(max, level.id);
  }
  return max;
}

/** Prefix of every per-game progress key in localStorage. */
const PROGRESS_KEY_PREFIX = 'gz-levels-';

/** localStorage key holding a game's progress (instant, offline fallback). */
function progressKey(gameKey: string): string {
  return `${PROGRESS_KEY_PREFIX}${gameKey}`;
}

/**
 * Forgets all locally-cached level progress on this browser. Called on logout
 * and on account-switch so the next player doesn't inherit the previous one's
 * unlocks (the per-account copy on Nakama Storage stays untouched).
 */
export function clearLocalProgress(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PROGRESS_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Ignore: nothing to clear if storage is unavailable.
  }
}

/** Reads progress synchronously from localStorage (instant, offline). Pure-ish. */
export function loadLocalProgress(gameKey: string): LevelProgress {
  try {
    const raw = localStorage.getItem(progressKey(gameKey));
    if (!raw) return defaultProgress();
    return { ...defaultProgress(), ...(JSON.parse(raw) as Partial<LevelProgress>) };
  } catch {
    return defaultProgress();
  }
}

/** Persists progress to localStorage immediately and to Nakama best-effort. */
export function saveProgress(gameKey: string, progress: LevelProgress): void {
  try {
    localStorage.setItem(progressKey(gameKey), JSON.stringify(progress));
  } catch {
    // Ignore quota / availability errors: the in-memory copy stays authoritative.
  }
  void writeStorage(progressKey(gameKey), progress);
}

/**
 * Loads progress from Nakama and merges it with the local copy, keeping the most
 * advanced of the two (so progress made on another device carries over). Falls
 * back to the local copy when the backend is unreachable.
 */
export async function loadProgress(gameKey: string): Promise<LevelProgress> {
  const local = loadLocalProgress(gameKey);
  const remote = await readStorage<LevelProgress>(progressKey(gameKey));
  if (!remote) return local;
  return {
    cleared: Math.max(local.cleared, remote.cleared ?? 0),
    bestScore: Math.max(local.bestScore, remote.bestScore ?? 0),
    selected: remote.selected || local.selected,
  };
}
