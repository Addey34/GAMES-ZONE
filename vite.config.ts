import { defineConfig } from 'vite';
import handlebars from 'vite-plugin-handlebars';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(projectRoot, 'src');

// =============================================================================
// SOURCE DE VERITE UNIQUE des jeux. Tout en decoule :
//   - les points d'entree du build (rollupOptions.input) ;
//   - le contexte Handlebars (`games`) qui alimente le rail (sidebar.hbs) ET le
//     menu d'accueil (index.html) via {{#each games}}.
// Ajouter un jeu = AJOUTER UNE LIGNE ici (puis creer src/<key>/<key>.{html,ts}).
// Convention : chaque jeu vit dans src/<key>/<key>.html ; `key` doit etre le nom
// du dossier (il sert aussi de data-nav pour l'etat actif du rail ET de nom de
// son logo SVG : public/icons/<key>.svg).
// `color` = token de couleur unie (base/variables.css) pour colorer l'item actif
// du rail (et, via --title-color, le titre de la page du jeu).
// `controls` = lignes { keys, action } affichées dans l'aide « Comment jouer »
// (bouton « i »), rendues par shell-open via le contexte par page (voir plus bas).
// `keys` peut contenir du HTML <kbd>…</kbd> (rendu non échappé, contenu de
// confiance défini ici) pour afficher de vraies touches ; ex. flèches + ZQSD.
// =============================================================================
const games = [
  {
    key: 'dactylographie',
    label: 'Dactylographie',
    color: '--color-dactylo',
    controls: [
      { keys: 'Frappe', action: 'Recopiez les mots affichés' },
      { keys: 'Chrono', action: 'Démarre à la première lettre' },
    ],
  },
  {
    key: 'snake',
    label: 'Snake',
    color: '--color-snake',
    controls: [
      { keys: '<kbd>↑ ↓ ← →</kbd> ou <kbd>Z Q S D</kbd>', action: 'Diriger le serpent' },
      { keys: 'Glisser (mobile)', action: 'Diriger le serpent au doigt' },
      { keys: 'But', action: 'Manger les souris, éviter sa queue' },
    ],
  },
  {
    key: 'pacman',
    label: 'Pacman',
    color: '--color-pacman',
    controls: [
      { keys: '<kbd>↑ ↓ ← →</kbd> ou <kbd>Z Q S D</kbd>', action: 'Déplacer Pac-Man' },
      { keys: 'Glisser (mobile)', action: 'Déplacer Pac-Man au doigt' },
      { keys: 'But', action: 'Manger toutes les pastilles' },
    ],
  },
  {
    key: '2048',
    label: '2048',
    color: '--color-2048',
    controls: [
      { keys: '<kbd>↑ ↓ ← →</kbd> ou <kbd>Z Q S D</kbd>', action: 'Glisser les tuiles' },
      { keys: 'Glisser (mobile)', action: 'Glisser les tuiles au doigt' },
      { keys: 'But', action: 'Fusionner pour atteindre 2048' },
    ],
  },
  {
    key: 'tetris',
    label: 'Tetris',
    color: '--color-tetris',
    controls: [
      { keys: '<kbd>← →</kbd> ou <kbd>Q D</kbd>', action: 'Déplacer la pièce' },
      { keys: '<kbd>↑</kbd> ou <kbd>Z</kbd> (ou tap)', action: 'Pivoter' },
      { keys: '<kbd>↓</kbd> ou <kbd>S</kbd>', action: 'Descente rapide' },
      { keys: '<kbd>Espace</kbd>', action: 'Chute instantanée' },
      { keys: 'Glisser (mobile)', action: '← → déplacer, ↓ descendre' },
    ],
  },
  {
    key: 'memory',
    label: 'Memory',
    color: '--color-memory',
    controls: [
      { keys: 'Clic / tap', action: 'Retourner une carte' },
      { keys: 'But', action: 'Associer toutes les paires' },
    ],
  },
  {
    key: 'breakout',
    label: 'Casse-brique',
    color: '--color-breakout',
    controls: [
      { keys: '<kbd>← →</kbd> ou <kbd>Q D</kbd>', action: 'Déplacer la raquette' },
      { keys: 'Glisser / souris', action: 'Déplacer la raquette' },
      { keys: 'But', action: 'Détruire toutes les briques' },
    ],
  },
];

export default defineConfig({
  // Les pages HTML (= points d'entrée) vivent dans src/, co-localisées avec
  // leur code. `publicDir` et `outDir` restent à la racine du projet.
  root: srcRoot,
  publicDir: resolve(projectRoot, 'public'),
  plugins: [
    // Partials HTML partagés (head, chrome de jeu, sidebar) inclus via {{> nom }}.
    // `games` est exposé à toutes les pages (boucle {{#each}}) ; `game` est le jeu
    // de la page courante (déduit du chemin), utilisé par shell-open pour l'aide.
    handlebars({
      partialDirectory: resolve(srcRoot, 'partials'),
      context(pagePath: string) {
        const path = pagePath.replace(/\\/g, '/');
        const game = games.find(
          (g) => path.includes(`/${g.key}/`) || path.endsWith(`/${g.key}.html`)
        );
        return { games, game };
      },
    }),
  ],
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      // index + une entree par jeu, derivees de la liste `games`.
      input: {
        main: resolve(srcRoot, 'index.html'),
        ...Object.fromEntries(
          games.map((g) => [g.key, resolve(srcRoot, `${g.key}/${g.key}.html`)])
        ),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
