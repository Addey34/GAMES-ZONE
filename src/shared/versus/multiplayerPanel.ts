import { setupPopover } from '../ui/popover.js';
import { GameOverlay } from '../ui/gameOverlay.js';
import { createSession, joinSession, NetMatch, LobbySnapshot } from '../net/match.js';

/**
 * The collapsible "Multiplayer" panel shown in the game-shell header.
 *
 * Owns the whole session lifecycle (create / join by code / lobby / leave) and
 * the roster UI, delegating the network to `net/match.ts` and the open/close to
 * {@link setupPopover} (like the Niveaux / Leaderboard panels). The match opens
 * in a **lobby**: the host sees the code + who has joined and presses "Start"
 * when ready (empty seats are then filled by bots by the game); guests wait for
 * that start. It tells the game what to do through two callbacks —
 * `onSessionStart(net)` once the host has started, and `onSessionEnd()` when the
 * session is left or torn down — so the panel stays game-agnostic and reusable by
 * any `multiplayer: true` game, whether 1-v-1 (Pong, Memory) or N-player (Ludo).
 */

/** Handle returned to the game so it can leave from its own UI (e.g. game-over). */
export interface MultiplayerHandle {
  /** Leaves the current session (no confirmation — the caller already decided). */
  leave(): void;
}

/** Callbacks the game wires into the panel. */
export interface MultiplayerOptions {
  /** Maximum human seats (default 2 for 1-v-1; e.g. 4 for Ludo). */
  capacity?: number;
  /** The host has started: begin the match with this (host/guest) match + seat. */
  onSessionStart(net: NetMatch): void;
  /** The session ended (left, or torn down): return to solo/bot play. */
  onSessionEnd(): void;
}

/**
 * Wires the multiplayer panel. Returns null when the shell markup is absent (a
 * game without `multiplayer: true`), so callers can safely ignore the result.
 */
export function setupMultiplayerPanel(opts: MultiplayerOptions): MultiplayerHandle | null {
  const pop = setupPopover({
    control: 'multiplayerControl',
    toggle: 'multiplayerToggle',
    panel: 'multiplayerPanel',
  });
  if (!pop) return null;
  const { panel, open, close } = pop;

  const capacity = opts.capacity ?? 2;
  let net: NetMatch | null = null;
  let started = false;

  const title = (): HTMLElement => {
    const el = document.createElement('p');
    el.className = 'game-pop-title';
    el.textContent = 'Multiplayer';
    return el;
  };

  /** Idle screen: create a session, or join one by code. */
  function renderIdle(message?: string, error = false): void {
    const section = document.createElement('div');
    section.className = 'mp-section';

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'btn btn--primary';
    create.textContent = 'Create a session';
    create.addEventListener('click', () => void doCreate());

    const or = document.createElement('div');
    or.className = 'mp-or';
    or.textContent = 'or';

    const join = document.createElement('form');
    join.className = 'mp-join';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-field';
    input.placeholder = 'Code';
    input.maxLength = 4;
    input.autocapitalize = 'characters';
    input.setAttribute('aria-label', 'Session code to join');
    const joinBtn = document.createElement('button');
    joinBtn.type = 'submit';
    joinBtn.className = 'btn btn--secondary';
    joinBtn.textContent = 'Join';
    join.append(input, joinBtn);
    join.addEventListener('submit', (e) => {
      e.preventDefault();
      void doJoin(input.value);
    });

    section.append(create, or, join);
    if (message) section.appendChild(statusLine(message, error ? 'is-error' : ''));

    panel.replaceChildren(title(), section);
  }

  /** Connecting screen: a single status line while we reach the backend. */
  function renderConnecting(message: string): void {
    const section = document.createElement('div');
    section.className = 'mp-section';
    section.appendChild(statusLine(message));
    panel.replaceChildren(title(), section);
  }

  /**
   * Lobby screen: the code to share (host), the live roster, a host-only "Start"
   * button and Leave. Re-rendered on every roster change.
   */
  function renderLobby(): void {
    if (!net) return;
    const snap = net.lobby();
    const section = document.createElement('div');
    section.className = 'mp-section';

    if (net.role === 'host') {
      const code = document.createElement('div');
      code.className = 'mp-code';
      const value = document.createElement('span');
      value.textContent = net.code;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'mp-code-copy';
      copy.setAttribute('aria-label', 'Copy code');
      copy.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i>';
      copy.addEventListener('click', () => void navigator.clipboard?.writeText(net?.code ?? ''));
      code.append(value, copy);
      section.appendChild(code);
    }

    section.appendChild(roster(snap));

    if (net.role === 'host') {
      // Need the opponent for a 1-v-1; for N-player the host may start with bots.
      const min = capacity === 2 ? 2 : 1;
      const start = document.createElement('button');
      start.type = 'button';
      start.className = 'btn btn--primary';
      start.textContent = 'Start';
      start.disabled = snap.count < min;
      start.addEventListener('click', () => net?.startMatch());
      section.appendChild(start);
    } else {
      section.appendChild(statusLine('Waiting for the host to start…'));
    }

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'btn btn--secondary';
    leaveBtn.textContent = 'Leave session';
    leaveBtn.addEventListener('click', confirmLeave);
    section.appendChild(leaveBtn);

    panel.replaceChildren(title(), section);
  }

  /** Roster line: how many players are in, and a note about bot-filled seats. */
  function roster(snap: LobbySnapshot): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'mp-roster';
    const count = document.createElement('span');
    count.className = 'mp-roster-count';
    count.innerHTML = `<i class="fas fa-users" aria-hidden="true"></i> ${snap.count}/${snap.capacity}`;
    wrap.appendChild(count);
    if (snap.capacity > snap.count) {
      const note = document.createElement('span');
      note.className = 'mp-roster-note';
      note.textContent = 'Empty seats will be filled by bots.';
      wrap.appendChild(note);
    }
    return wrap;
  }

  function statusLine(text: string, cls = ''): HTMLElement {
    const el = document.createElement('p');
    el.className = `mp-status ${cls}`.trim();
    el.textContent = text;
    return el;
  }

  async function doCreate(): Promise<void> {
    // Pin the panel open: the lobby shows the code + roster, so it must stay up
    // even once the cursor leaves (no longer just a hover peek).
    open();
    renderConnecting('Creating the session…');
    try {
      net = await createSession(capacity);
      wireNet();
      renderLobby();
    } catch {
      renderIdle('Cannot connect to the server.', true);
    }
  }

  async function doJoin(rawCode: string): Promise<void> {
    const code = rawCode.trim();
    if (!code) return;
    open();
    renderConnecting('Connecting…');
    try {
      net = await joinSession(code, capacity);
      wireNet();
      renderLobby();
    } catch {
      renderIdle('Invalid code or server unreachable.', true);
    }
  }

  function wireNet(): void {
    if (!net) return;
    net.onLobby((snap) => {
      if (snap.started) onStarted();
      else renderLobby();
    });
    net.onClose(() => onClosed());
  }

  /** Host pressed Start (or the guest received it): hand off to the game. */
  function onStarted(): void {
    if (started || !net) return;
    started = true;
    close();
    opts.onSessionStart(net);
  }

  /** The session was torn down by the network (host gone / 1-v-1 peer gone). */
  function onClosed(): void {
    const wasActive = started || net !== null;
    teardown();
    renderIdle('The session has ended.', true);
    if (wasActive) opts.onSessionEnd();
  }

  /** Drops the local match handle and flags (without UI). */
  function teardown(): void {
    net?.leave();
    net = null;
    started = false;
  }

  function doLeave(): void {
    teardown();
    renderIdle();
    opts.onSessionEnd();
  }

  /** Leave with a confirmation step (panel-initiated leave). */
  function confirmLeave(): void {
    const overlay = new GameOverlay();
    overlay.show({
      title: 'Leave the session?',
      bodyHtml: '<div>You will return to a game against the bot.</div>',
      buttons: [
        {
          text: 'Quit',
          primary: true,
          onClick: () => {
            overlay.hide();
            doLeave();
          },
        },
        { text: 'Cancel', onClick: () => overlay.hide() },
      ],
    });
  }

  renderIdle();

  return {
    leave: doLeave,
  };
}
