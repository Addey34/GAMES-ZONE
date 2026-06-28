import { Socket, Match, MatchData, MatchPresenceEvent } from '@heroiclabs/nakama-js';
import { getClient, getSession } from './nakama.js';

/**
 * Relayed realtime match layer (best-effort), game-agnostic.
 *
 * Nakama relays match-state messages between the two players; no server-side
 * match handler is needed. We exploit Nakama's **named matches**:
 * `socket.createMatch(name)` is de-duplicated by name, so the *same* short code
 * used as the match name puts both players in the *same* match — the host calls
 * it after generating a code, the guest after typing it. There is therefore no
 * code→match mapping to store, and **no server change** to ship.
 *
 * Authority is decided by the UI, not the server: whoever pressed "Créer" is the
 * `host` (authoritative simulation), whoever pressed "Rejoindre" is the `guest`.
 * Everything here swallows failures so a backend issue never crashes the game
 * (the page keeps working in solo/bot mode).
 */

/** Connection over TLS (mirrors the setting in nakama.ts). */
const USE_SSL = true;
/** Code alphabet without look-alikes (no 0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

/** A decoded message received from the opponent. */
export interface MatchMessage {
  opCode: number;
  data: unknown;
  senderId: string;
}

/** Presence delta (opponent user ids that joined / left). */
export interface PresenceDelta {
  joins: string[];
  leaves: string[];
}

/** A live relayed match the game drives. */
export interface NetMatch {
  role: 'host' | 'guest';
  matchId: string;
  /** The short session code (match name) shared between players. */
  code: string;
  /** This client's user id. */
  selfUserId: string;
  /** Sends a JSON-serialisable payload under an op code to the other player. */
  send(opCode: number, data: unknown): void;
  /** Registers a message handler. */
  onMessage(cb: (msg: MatchMessage) => void): void;
  /** Registers a presence (join/leave) handler. */
  onPresence(cb: (delta: PresenceDelta) => void): void;
  /** Whether the opponent is currently in the match. */
  opponentPresent(): boolean;
  /** Leaves the match (best-effort). */
  leave(): Promise<void>;
}

let socket: Socket | null = null;

/** Lazily opens and connects the singleton socket with the app's session. */
async function getSocket(): Promise<Socket> {
  const session = await getSession();
  if (!socket) {
    socket = getClient().createSocket(USE_SSL, false);
    await socket.connect(session, true);
  }
  return socket;
}

/** Generates a short, human-friendly session code. */
function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Wraps a joined Nakama match into a {@link NetMatch}. */
async function buildNetMatch(
  match: Match,
  code: string,
  role: 'host' | 'guest'
): Promise<NetMatch> {
  const s = await getSocket();
  const session = await getSession();
  const selfUserId = session.user_id ?? '';
  // Identify "self" by SESSION, not user: two tabs of the same (anonymous)
  // account share a user_id but are distinct sessions, so a user_id filter would
  // hide one as the other's self and break presence. session_id is per-connection.
  const selfSessionId = match.self?.session_id ?? '';

  const messageCbs: ((msg: MatchMessage) => void)[] = [];
  const presenceCbs: ((delta: PresenceDelta) => void)[] = [];
  const present = new Set<string>();
  // Seed with players already in the match (e.g. the host the guest just joined).
  for (const p of match.presences ?? []) {
    if (p.session_id !== selfSessionId) present.add(p.session_id);
  }

  s.onmatchdata = (d: MatchData): void => {
    if (d.match_id !== match.match_id) return;
    const text = d.data ? new TextDecoder().decode(d.data) : '';
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    const msg: MatchMessage = { opCode: d.op_code, data, senderId: d.presence?.user_id ?? '' };
    for (const cb of messageCbs) cb(msg);
  };

  s.onmatchpresence = (e: MatchPresenceEvent): void => {
    if (e.match_id !== match.match_id) return;
    const joins = (e.joins ?? []).filter((p) => p.session_id !== selfSessionId);
    const leaves = (e.leaves ?? []).filter((p) => p.session_id !== selfSessionId);
    joins.forEach((p) => present.add(p.session_id));
    leaves.forEach((p) => present.delete(p.session_id));
    if (joins.length || leaves.length) {
      for (const cb of presenceCbs) {
        cb({ joins: joins.map((p) => p.user_id), leaves: leaves.map((p) => p.user_id) });
      }
    }
  };

  return {
    role,
    matchId: match.match_id,
    code,
    selfUserId,
    send(opCode, data) {
      try {
        s.sendMatchState(match.match_id, opCode, JSON.stringify(data ?? null));
      } catch {
        // Best-effort: a dropped message must not crash the loop.
      }
    },
    onMessage(cb) {
      messageCbs.push(cb);
    },
    onPresence(cb) {
      presenceCbs.push(cb);
    },
    opponentPresent() {
      return present.size > 0;
    },
    async leave() {
      try {
        await s.leaveMatch(match.match_id);
      } catch {
        // Already gone / disconnected: nothing to do.
      }
    },
  };
}

/**
 * Creates a new session: generates a code, opens the named match and returns the
 * host-side {@link NetMatch}. Rejects if the backend is unreachable.
 */
export async function createSession(): Promise<NetMatch> {
  const s = await getSocket();
  const code = generateCode();
  const match = await s.createMatch(code);
  return buildNetMatch(match, code, 'host');
}

/**
 * Joins an existing session by its code (the match name). Returns the guest-side
 * {@link NetMatch}. Rejects if the backend is unreachable.
 */
export async function joinSession(code: string): Promise<NetMatch> {
  const s = await getSocket();
  const normalized = code.trim().toUpperCase();
  const match = await s.createMatch(normalized);
  return buildNetMatch(match, normalized, 'guest');
}
