/**
 * The player's display name ("pseudo"), shown on the leaderboards.
 *
 * Asked once and stored locally, then reused everywhere (and editable later in
 * the settings). Independent of Nakama auth: a signed-in player keeps the same
 * pseudo, an anonymous one still gets a name. Kept tiny and synchronous so the
 * game-over flow can read it without awaiting the backend.
 */

const NAME_KEY = 'gz-player-name';
/** Hard cap so a pasted essay can't blow up the leaderboard layout. */
const MAX_LENGTH = 20;

/** The stored pseudo, or null when the player hasn't chosen one yet. */
export function getPlayerName(): string | null {
  try {
    const name = localStorage.getItem(NAME_KEY);
    return name && name.trim() ? name : null;
  } catch {
    return null;
  }
}

/** Stores the pseudo (trimmed and length-capped). No-op on an empty value. */
export function setPlayerName(name: string): void {
  const clean = name.trim().slice(0, MAX_LENGTH);
  if (!clean) return;
  try {
    localStorage.setItem(NAME_KEY, clean);
  } catch {
    // Ignore storage errors: the name just won't persist beyond this session.
  }
}

/** Whether the player has already chosen a pseudo. */
export function hasPlayerName(): boolean {
  return getPlayerName() !== null;
}
