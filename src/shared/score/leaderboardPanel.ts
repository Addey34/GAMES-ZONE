import { setupPopover } from '../ui/popover.js';

/**
 * The collapsible "Leaderboard" panel in the game shell header.
 *
 * It only handles open/close (delegated to {@link setupPopover}); the score
 * table inside it (`#scoreTable`) is filled by the engine's
 * {@link GameEngine.renderScoreTable}. Returns a handle so the engine can open
 * it programmatically (e.g. from the game-over overlay).
 */

/** Handle returned by {@link setupLeaderboardPanel}. */
export interface LeaderboardPanelHandle {
  /** Opens the panel. */
  open(): void;
}

/**
 * Wires the leaderboard panel. Returns null when the shell markup is absent (a
 * game without `leaderboard: true`), so callers can ignore the result.
 */
export function setupLeaderboardPanel(): LeaderboardPanelHandle | null {
  const pop = setupPopover({
    control: 'leaderboardControl',
    toggle: 'leaderboardToggle',
    panel: 'leaderboardPanel',
  });
  if (!pop) return null;
  return { open: pop.open };
}
