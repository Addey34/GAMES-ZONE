import { setupPopover } from '../ui/popover.js';
import { GameOverlay } from '../ui/gameOverlay.js';
import { createSession, joinSession, NetMatch } from '../net/match.js';

/**
 * The collapsible "Multijoueur" panel shown in the game-shell header.
 *
 * Owns the whole session lifecycle (create / join by code / leave) and the
 * presence UI, delegating the network to `net/match.ts` and the open/close to
 * {@link setupPopover} (like the Niveaux / Classement panels). It tells the game
 * what to do through two callbacks — `onSessionStart(net)` when both players are
 * in, and `onSessionEnd()` when the session is left — so the panel stays
 * game-agnostic and reusable by any `multiplayer: true` game.
 */

/** Handle returned to the game so it can leave from its own UI (e.g. game-over). */
export interface MultiplayerHandle {
  /** Leaves the current session (no confirmation — the caller already decided). */
  leave(): void;
}

/** Callbacks the game wires into the panel. */
export interface MultiplayerOptions {
  /** Both players are present: start the match with this (host/guest) match. */
  onSessionStart(net: NetMatch): void;
  /** The session ended (left, or opponent gone): return to solo/bot play. */
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

  let net: NetMatch | null = null;
  let started = false;

  const title = (): HTMLElement => {
    const el = document.createElement('p');
    el.className = 'game-pop-title';
    el.textContent = 'Multijoueur';
    return el;
  };

  /** Idle screen: create a session, or join one by code. */
  function renderIdle(message?: string, error = false): void {
    const section = document.createElement('div');
    section.className = 'mp-section';

    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'btn btn--primary';
    create.textContent = 'Créer une session';
    create.addEventListener('click', () => void doCreate());

    const or = document.createElement('div');
    or.className = 'mp-or';
    or.textContent = 'ou';

    const join = document.createElement('form');
    join.className = 'mp-join';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-field';
    input.placeholder = 'Code';
    input.maxLength = 4;
    input.autocapitalize = 'characters';
    input.setAttribute('aria-label', 'Code de session à rejoindre');
    const joinBtn = document.createElement('button');
    joinBtn.type = 'submit';
    joinBtn.className = 'btn btn--secondary';
    joinBtn.textContent = 'Rejoindre';
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

  /** Active-session screen: the code to share (host), status, and Quitter. */
  function renderSession(): void {
    if (!net) return;
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
      copy.setAttribute('aria-label', 'Copier le code');
      copy.innerHTML = '<i class="fas fa-copy" aria-hidden="true"></i>';
      copy.addEventListener('click', () => void navigator.clipboard?.writeText(net?.code ?? ''));
      code.append(value, copy);
      section.appendChild(code);
    }

    section.appendChild(statusLine('En attente de l’adversaire…'));

    const leaveBtn = document.createElement('button');
    leaveBtn.type = 'button';
    leaveBtn.className = 'btn btn--secondary';
    leaveBtn.textContent = 'Quitter la session';
    leaveBtn.addEventListener('click', confirmLeave);
    section.appendChild(leaveBtn);

    panel.replaceChildren(title(), section);
  }

  function statusLine(text: string, cls = ''): HTMLElement {
    const el = document.createElement('p');
    el.className = `mp-status ${cls}`.trim();
    el.textContent = text;
    return el;
  }

  /** Updates the status line of the currently rendered session screen. */
  function setStatus(text: string, cls = ''): void {
    const existing = panel.querySelector('.mp-status');
    const line = statusLine(text, cls);
    if (existing) existing.replaceWith(line);
  }

  async function doCreate(): Promise<void> {
    // Pin the panel open: creating/joining shows the code and session status, so
    // it must stay up even once the cursor leaves (no longer just a hover peek).
    open();
    renderConnecting('Création de la session…');
    try {
      net = await createSession();
      wireNet();
      renderSession();
    } catch {
      renderIdle('Connexion au serveur impossible.', true);
    }
  }

  async function doJoin(rawCode: string): Promise<void> {
    const code = rawCode.trim();
    if (!code) return;
    open();
    renderConnecting('Connexion…');
    try {
      net = await joinSession(code);
      wireNet();
      renderSession();
      if (net.opponentPresent()) onBothPresent();
      else setStatus('En attente de l’hôte…');
    } catch {
      renderIdle('Code invalide ou serveur injoignable.', true);
    }
  }

  function wireNet(): void {
    net?.onPresence(({ joins, leaves }) => {
      if (joins.length) onBothPresent();
      if (leaves.length) onOpponentLeft();
    });
  }

  function onBothPresent(): void {
    if (started || !net) return;
    started = true;
    setStatus('Adversaire connecté !', 'is-ready');
    close();
    opts.onSessionStart(net);
  }

  function onOpponentLeft(): void {
    teardown();
    renderIdle('L’adversaire a quitté la session.', true);
    opts.onSessionEnd();
  }

  /** Drops the local match handle and presence flag (without UI). */
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
      title: 'Quitter la session ?',
      bodyHtml: '<div>Tu reviendras en partie contre le bot.</div>',
      buttons: [
        {
          text: 'Quitter',
          primary: true,
          onClick: () => {
            overlay.hide();
            doLeave();
          },
        },
        { text: 'Annuler', onClick: () => overlay.hide() },
      ],
    });
  }

  renderIdle();

  return {
    leave: doLeave,
  };
}
