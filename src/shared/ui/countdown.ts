/**
 * Kickoff countdown overlay (3 · 2 · 1 · GO) shown over the game shell.
 *
 * Generic and game-agnostic: mounts a big centred number into `.game-shell`
 * (same host as {@link GameOverlay}), ticks down once per interval, then removes
 * itself and resolves. Used before a multiplayer round starts so both players get
 * a clear, shared "get ready" beat.
 */
export function runCountdown(seconds = 3, label = 'Ready?'): Promise<void> {
  return new Promise((resolve) => {
    const host = document.querySelector<HTMLElement>('.game-shell');
    if (!host) {
      resolve();
      return;
    }

    const root = document.createElement('div');
    root.className = 'game-countdown';
    root.setAttribute('aria-live', 'assertive');

    const number = document.createElement('div');
    number.className = 'game-countdown-number';
    number.textContent = String(seconds);

    const labelEl = document.createElement('div');
    labelEl.className = 'game-countdown-label';
    labelEl.textContent = label;

    root.append(number, labelEl);
    host.appendChild(root);

    let n = seconds;
    const id = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        number.textContent = String(n);
      } else if (n === 0) {
        number.textContent = 'GO !';
      } else {
        window.clearInterval(id);
        root.remove();
        resolve();
      }
    }, 800);
  });
}
