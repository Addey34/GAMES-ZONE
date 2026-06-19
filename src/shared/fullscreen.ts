// Bouton plein écran d'une page de jeu : bascule le plein écran sur la zone de
// jeu (.game-container) et alterne l'icône expand/compress.
// Chargé sur chaque page de jeu (inclus par shell-open).

const toggle = document.querySelector<HTMLButtonElement>('.game-fullscreen-toggle');
const target = document.querySelector<HTMLElement>('.game-container');

if (toggle && target) {
  // API plein écran indisponible (ex. Safari iPhone) : on masque le bouton.
  if (!document.fullscreenEnabled) {
    toggle.hidden = true;
  } else {
    const icon = toggle.querySelector('i');

    // Reflète l'état courant sur l'icône et les attributs ARIA.
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
      // Refus/erreur (geste utilisateur requis, permission…) : sans gravité.
      action.catch(() => {});
    });

    document.addEventListener('fullscreenchange', sync);
    sync();
  }
}

// Module ESM (chargé via <script type="module">).
export {};
