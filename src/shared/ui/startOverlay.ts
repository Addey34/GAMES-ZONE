/**
 * Modular "Play" start screen, shared by every game that would otherwise start
 * on its own at load time.
 *
 * Mounts a centred Play button over the game shell (same host as the game-over
 * and countdown overlays) so the loop only begins once the player decides. The
 * engine shows it from {@link GameEngine.presentStartScreen} (driven by
 * `bootstrapGame`), so a single implementation covers all auto-starting games —
 * no per-game wiring. Games that already wait for an event (e.g. Typing starts
 * on the first keystroke, `autoStart: false`) keep their own behaviour.
 */
export function showStartOverlay(onPlay: () => void, label = 'Play'): void {
  const host = document.querySelector<HTMLElement>('.game-shell');
  if (!host) {
    // No shell to mount onto: fall back to starting immediately.
    onPlay();
    return;
  }

  dismissStartOverlay();

  const root = document.createElement('div');
  root.className = 'game-start';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'game-start-button';
  button.setAttribute('aria-label', label);
  button.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';

  const text = document.createElement('span');
  text.className = 'game-start-label';
  text.textContent = label;

  button.addEventListener('click', () => {
    root.remove();
    onPlay();
  });

  root.append(button, text);
  host.appendChild(root);
  button.focus();
}

/**
 * Removes the Play screen if present. Called when the loop starts through another
 * path (e.g. a multiplayer session kicks off) so the overlay never lingers over
 * a running game.
 */
export function dismissStartOverlay(): void {
  document.querySelector('.game-start')?.remove();
}
