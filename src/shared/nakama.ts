import { Client, Session } from '@heroiclabs/nakama-js';
import { ScoreEntry } from './ScoreManager.js';

/**
 * Thin wrapper around the Nakama client used for the online leaderboards.
 *
 * The backend is a self-hosted Nakama server (see project memory). Everything
 * here is best-effort: if the server is unreachable, callers fall back to the
 * local `localStorage` leaderboard, so the games keep working offline.
 *
 * It is game-agnostic: a whole {@link ScoreEntry} is stored, with the score in
 * the record's score field and every other field (username + game-specific
 * extras like Dactylographie's wpm/lpm) carried in the record metadata. So a
 * game's custom leaderboard columns work online exactly like they do locally.
 */

/** Public connection settings of the Nakama backend. */
const HOST = '82-70-233-45.sslip.io';
const PORT = '443';
const USE_SSL = true;
/**
 * The Nakama "server key" (NOT a secret password): it is the client-side key
 * games use to talk to the server, and is meant to live in front-end code.
 */
const SERVER_KEY = 'cFmiblnZCHyu3JRSs9jeQEBLUxwI';

/** localStorage key holding this browser's stable device id (one player). */
const DEVICE_ID_KEY = 'gz-nakama-device-id';

/** Entry fields owned by the record itself, hence not duplicated in metadata. */
const RECORD_OWNED_FIELDS = ['score', 'date'];

/** Minimal shape of a leaderboard record we read back from Nakama. */
interface RawLeaderboardRecord {
  score?: number;
  username?: string;
  metadata?: object;
  update_time?: string;
}

/**
 * Builds the metadata stored alongside a score: every entry field except the
 * ones the record owns natively (score, date). Keeps the username and any
 * game-specific extras (e.g. Dactylographie's wpm/lpm). Pure → unit-tested.
 */
export function buildScoreMetadata(entry: ScoreEntry): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!RECORD_OWNED_FIELDS.includes(key)) metadata[key] = value;
  }
  return metadata;
}

/**
 * Rebuilds a {@link ScoreEntry} from a leaderboard record: score and date come
 * from the record, the username and extras from its metadata. Pure → unit-tested.
 */
export function recordToScoreEntry(record: RawLeaderboardRecord): ScoreEntry {
  const meta = (record.metadata ?? {}) as Record<string, unknown>;
  const entry: ScoreEntry = {
    username: typeof meta.username === 'string' ? meta.username : record.username || 'Joueur',
    score: record.score ?? 0,
    date: record.update_time ? new Date(record.update_time) : undefined,
  };
  // Restore game-specific extra fields (e.g. Dactylographie's wpm/lpm).
  for (const [key, value] of Object.entries(meta)) {
    if (key !== 'username') (entry as unknown as Record<string, unknown>)[key] = value;
  }
  return entry;
}

/** Best-effort decode of the "name" (or email) claim from a Google ID token. */
export function googleTokenName(idToken: string): string | undefined {
  try {
    const part = idToken.split('.')[1];
    if (!part) return undefined;
    // JWT payloads are base64url and unpadded: convert and re-pad before atob.
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { name?: string; email?: string };
    return claims.name || claims.email;
  } catch {
    return undefined;
  }
}

let client: Client | null = null;
/** Cached authentication so we only sign in once per page load. */
let sessionPromise: Promise<Session> | null = null;

/** Lazily builds the singleton client. */
function getClient(): Client {
  if (!client) {
    client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  }
  return client;
}

/**
 * Returns this browser's device id, generating and persisting one on first use.
 * The same id always maps to the same Nakama account ("device authentication").
 */
function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `gz-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Authenticates anonymously (device auth), reusing the session within a page. */
function getSession(): Promise<Session> {
  if (!sessionPromise) {
    sessionPromise = getClient()
      .authenticateDevice(getDeviceId(), true)
      .catch((err) => {
        // Reset so a later call can retry instead of reusing the failed promise.
        sessionPromise = null;
        throw err;
      });
  }
  return sessionPromise;
}

/**
 * Submits a full score entry to the given leaderboard. The score goes to the
 * record's score field; the username and any game-specific extras travel in the
 * metadata. Rejects if the backend is unreachable (callers should catch).
 */
export async function submitLeaderboardScore(
  leaderboardId: string,
  entry: ScoreEntry
): Promise<void> {
  const session = await getSession();
  await getClient().writeLeaderboardRecord(session, leaderboardId, {
    score: String(entry.score),
    metadata: buildScoreMetadata(entry),
  });
}

/**
 * Fetches the top `limit` entries of a leaderboard, sorted by the server, each
 * rebuilt as a {@link ScoreEntry} (extras restored from metadata so custom
 * columns render). Rejects if the backend is unreachable (callers fall back).
 */
export async function listLeaderboardScores(
  leaderboardId: string,
  limit = 10
): Promise<ScoreEntry[]> {
  const session = await getSession();
  const result = await getClient().listLeaderboardRecords(session, leaderboardId, undefined, limit);
  return (result.records ?? []).map(recordToScoreEntry);
}

/** Google OAuth client id (public) used by the front-end sign-in flow. */
export const GOOGLE_CLIENT_ID =
  '678823080002-dbu42nv5qagaknoh7s7haqotos8s4ma4.apps.googleusercontent.com';

/** The current player, as shown in the UI. */
export interface CurrentUser {
  displayName: string;
  /** true once a Google account is linked (i.e. signed in, not anonymous). */
  loggedIn: boolean;
}

/**
 * Signs in with a Google ID token. First tries to LINK Google to the current
 * (anonymous device) account so existing scores carry over; if that Google
 * identity already belongs to another account (e.g. the player signed in before
 * on another device), switches to that account instead. Sets the display name
 * from the Google profile. Rejects if the backend is unreachable.
 */
export async function loginWithGoogleToken(idToken: string): Promise<void> {
  const nakama = getClient();
  let session = await getSession();
  try {
    await nakama.linkGoogle(session, { token: idToken });
  } catch {
    // Google already linked elsewhere → sign into that existing account.
    session = await nakama.authenticateGoogle(idToken, true);
    sessionPromise = Promise.resolve(session);
  }
  const name = googleTokenName(idToken);
  if (name) {
    try {
      await nakama.updateAccount(session, { display_name: name });
    } catch {
      // Non-fatal: a failed name update must not break the sign-in.
    }
  }
}

/** Returns the current player (display name + whether Google is linked). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const session = await getSession();
    const account = await getClient().getAccount(session);
    return {
      displayName: account.user?.display_name || account.user?.username || 'Joueur',
      loggedIn: Boolean(account.user?.google_id),
    };
  } catch {
    return null;
  }
}

/**
 * "Logs out" by abandoning this browser's anonymous device id: the next session
 * starts as a fresh anonymous player. Signing in with Google again re-attaches
 * to the same Google account (and its scores).
 */
export function logout(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  client = null;
  sessionPromise = null;
}
