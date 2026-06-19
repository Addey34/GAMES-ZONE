// Behavior of the global sidebar (neon rail). Loaded on every page.
//  1. Marks the link matching the current page (.is-active) based on the URL.
//  2. Handles open/close in mobile mode (hamburger button + scrim).
// No hover expansion here: that is pure CSS (desktop). This script only handles
// the active state and the touch toggle.

const sidebar = document.querySelector('.sidebar');
if (sidebar) {
  // --- 1. Active state based on the URL ---------------------------------------
  // Clean URLs: each game is served at /<key> (e.g. /snake, /2048). We mark
  // the link whose data-nav matches the 1st path segment — also covering
  // /<key>/ and /<key>/index.html (direct access or dev server). The home page
  // has no dedicated entry (the Games Zone logo acts as the way back).
  const path = window.location.pathname;
  for (const link of document.querySelectorAll<HTMLElement>('.sidebar-link')) {
    const nav = link.dataset.nav;
    if (nav && (path === `/${nav}` || path.startsWith(`/${nav}/`))) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  }

  if (path === '/' || path === '/index.html') {
    document.querySelector('.sidebar-brand')?.setAttribute('aria-current', 'page');
  }

  // --- 2. Mobile toggle ------------------------------------------------------
  const toggle = document.querySelector('.sidebar-toggle');
  const scrim = document.querySelector<HTMLElement>('.sidebar-scrim');

  const setOpen = (open: boolean): void => {
    document.body.classList.toggle('sidebar-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
  };

  toggle?.addEventListener('click', () =>
    setOpen(!document.body.classList.contains('sidebar-open'))
  );
  scrim?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}

// File treated as an ESM module (loaded via <script type="module">).
export {};
