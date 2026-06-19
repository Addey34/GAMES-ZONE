// Comportement de la sidebar globale (rail neon). Chargé sur toutes les pages.
//  1. Marque le lien correspondant à la page courante (.is-active) d'après l'URL.
//  2. Gère l'ouverture/fermeture en mode mobile (bouton hamburger + scrim).
// Pas d'expansion au survol ici : c'est du CSS pur (desktop). Ce script ne fait
// que l'état actif et le toggle tactile.

const sidebar = document.querySelector('.sidebar');
if (sidebar) {
  // --- 1. État actif selon l'URL ---------------------------------------------
  // Chaque jeu vit dans son dossier (/snake/, /2048/...) : on marque le lien dont
  // le data-nav apparaît dans le chemin. La page d'accueil n'a pas d'entrée dédiée
  // (le logo Games Zone fait office de retour accueil) ; on le marque sur la home.
  const path = window.location.pathname;
  for (const link of document.querySelectorAll<HTMLElement>('.sidebar-link')) {
    if (link.dataset.nav && path.includes(`/${link.dataset.nav}/`)) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  }

  if (path === '/' || path.endsWith('/index.html')) {
    document.querySelector('.sidebar-brand')?.setAttribute('aria-current', 'page');
  }

  // --- 2. Toggle mobile ------------------------------------------------------
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

// Fichier traité comme module ESM (chargé via <script type="module">).
export {};
