// Immersive "Zen" mode for a game page: hides every bit of chrome (nav rail,
// title, action popovers, leaderboard) and blows the play area up to fill the
// screen, for distraction-free play on desktop AND mobile. It's pure CSS driven
// by a `zen-mode` class on <body>, so it works even where the Fullscreen API is
// unavailable (e.g. iPhone Safari); where it IS available we also enter native
// fullscreen on top (hidden browser UI). Loaded on every game page (included by
// shell-open). Esc — or leaving native fullscreen — exits.

const toggle = document.querySelector<HTMLButtonElement>('.game-fullscreen-toggle');
const container = document.querySelector<HTMLElement>('.game-container');

if (toggle && container) {
  const icon = toggle.querySelector('i');

  const isZen = (): boolean => document.body.classList.contains('zen-mode');

  // Reflects the current state on the body class, the icon and ARIA.
  const sync = (active: boolean): void => {
    document.body.classList.toggle('zen-mode', active);
    toggle.setAttribute('aria-pressed', String(active));
    toggle.setAttribute('aria-label', active ? 'Exit immersive mode' : 'Immersive mode');
    icon?.classList.toggle('fa-expand', !active);
    icon?.classList.toggle('fa-compress', active);
  };

  const enter = (): void => {
    sync(true);
    // Bonus where supported: hide the browser UI too. Refusal is harmless — the
    // CSS zen layout already stands on its own.
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    }
  };

  const exit = (): void => {
    sync(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  toggle.addEventListener('click', () => (isZen() ? exit() : enter()));

  // Leaving native fullscreen (its own Esc/gesture) also leaves zen, so a single
  // Esc fully exits where fullscreen is in play.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isZen()) sync(false);
  });

  // Esc as a universal exit, including where native fullscreen isn't used (iOS).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isZen()) exit();
  });
}

// ESM module (loaded via <script type="module">).
export {};
