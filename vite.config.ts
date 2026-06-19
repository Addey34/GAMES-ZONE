import { defineConfig } from 'vite';
import handlebars from 'vite-plugin-handlebars';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(projectRoot, 'src');

// =============================================================================
// SINGLE SOURCE OF TRUTH for the games. Everything derives from it:
//   - the build entry points (rollupOptions.input);
//   - the Handlebars context (`games`) that feeds the rail (sidebar.hbs) AND the
//     home menu (index.html) via {{#each games}}.
// Adding a game = ADD ONE LINE here (then create src/<key>/index.html +
// <key>-main.ts + <Key>.ts). Convention: each game lives in src/<key>/, its page
// is src/<key>/index.html (served at the clean URL /<key>). `key` is the folder
// name (also used as data-nav for the rail's active state AND as the name of its
// SVG logo: public/icons/<key>.svg).
// `color` = a solid-color token (base/variables.css) to color the rail's active
// item (and, via --title-color, the game page title).
// `controls` = { keys, action } lines shown in the "How to play" help
// (the "i" button), rendered by shell-open via the per-page context (see below).
// `keys` may contain <kbd>…</kbd> HTML (rendered unescaped, trusted content
// defined here) to display real keys; e.g. arrows + ZQSD.
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
  // The HTML pages (= entry points) live in src/, co-located with their code.
  // `publicDir` and `outDir` stay at the project root.
  root: srcRoot,
  publicDir: resolve(projectRoot, 'public'),
  plugins: [
    // Shared HTML partials (head, game chrome, sidebar) included via {{> name }}.
    // `games` is exposed to every page ({{#each}} loop); `game` is the current
    // page's game (derived from the path), used by shell-open for the help.
    handlebars({
      partialDirectory: resolve(srcRoot, 'partials'),
      context(pagePath: string) {
        // Each game page lives in src/<key>/index.html: we find the current game
        // by its folder segment (the home page, src/index.html, has none).
        const path = pagePath.replace(/\\/g, '/');
        const game = games.find((g) => path.includes(`/${g.key}/`));
        return { games, game };
      },
    }),
  ],
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      // index + one entry per game, derived from the `games` list. Each game page
      // is src/<key>/index.html -> built to dist/<key>/index.html, served at the
      // clean URL /<key> (see render.yaml for the rewrite).
      input: {
        main: resolve(srcRoot, 'index.html'),
        ...Object.fromEntries(games.map((g) => [g.key, resolve(srcRoot, `${g.key}/index.html`)])),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
