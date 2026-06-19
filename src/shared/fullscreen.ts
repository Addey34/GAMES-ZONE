// Fullscreen button of a game page: toggles fullscreen on the game area
// (.game-container) and switches the expand/compress icon.
// Loaded on every game page (included by shell-open).

const toggle = document.querySelector<HTMLButtonElement>('.game-fullscreen-toggle');
const target = document.querySelector<HTMLElement>('.game-container');

if (toggle && target) {
  // Fullscreen API unavailable (e.g. Safari iPhone): hide the button.
  if (!document.fullscreenEnabled) {
    toggle.hidden = true;
  } else {
    const icon = toggle.querySelector('i');

    // Reflects the current state on the icon and the ARIA attributes.
    const sync = (): void => {
      const active = document.fullscreenElement === target;
      toggle.setAttribute('aria-pressed', String(active));
      toggle.setAttribute('aria-label', active ? 'Quitter le plein écran' : 'Plein écran');
      icon?.classList.toggle('fa-expand', !active);
      icon?.classList.toggle('fa-compress', active);
    };

    toggle.addEventListener('click', () => {
      const action = document.fullscreenElement
        ? document.exitFullscreen()
        : target.requestFullscreen();
      // Refusal/error (user gesture required, permission…): harmless.
      action.catch(() => {});
    });

    document.addEventListener('fullscreenchange', sync);
    sync();
  }
}

// ESM module (loaded via <script type="module">).
export {};
