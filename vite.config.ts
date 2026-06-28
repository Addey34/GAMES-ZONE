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
// `levels: true` (optional) renders the shell's collapsible "Niveaux" panel for
// that game; the level set + unlock rules are declared in the game's own code.
// `leaderboard: true` (optional) renders the collapsible "Classement" panel
// (hosting the score table); omit it for games where a high-score board makes no
// sense (e.g. Pac-Man, which is level-based).
// `speed: true` (optional) adds the typing game's extra "Vitesse" column to that
// leaderboard table.
// `settings: true` (optional) renders the shell's "Paramètres" popover (filled by
// ui/settingsPanel.ts; e.g. Pong's bot difficulty + win score).
// `multiplayer: true` (optional) renders the shell's "Multijoueur" popover for
// relayed 1-v-1 sessions (versus/multiplayerPanel.ts; e.g. Pong).
// =============================================================================
const games = [
  {
    key: 'dactylographie',
    label: 'Dactylographie',
    color: '--color-dactylo',
    leaderboard: true,
    speed: true,
    controls: [
      { keys: 'Frappe', action: 'Recopiez les mots affichés' },
      { keys: 'Chrono', action: 'Démarre à la première lettre' },
    ],
  },
  {
    key: 'snake',
    label: 'Snake',
    color: '--color-snake',
    leaderboard: true,
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
    // Drives the shell's "Niveaux" panel (the level config itself lives in
    // PacmanGame); set `levels: true` on any game that opts into level selection.
    levels: true,
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
    leaderboard: true,
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
    leaderboard: true,
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
    settings: true,
    multiplayer: true,
    controls: [
      { keys: 'Clic / tap', action: 'Retourner deux cartes' },
      { keys: 'Paire', action: 'Trouvée → tu rejoues (+1)' },
      { keys: 'Chrono', action: '15 s par tour, sinon coup auto' },
      { keys: 'But', action: 'Plus de paires que l’adversaire' },
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
  {
    key: 'pong',
    label: 'Pong',
    color: '--color-pong',
    // Active la pastille « Paramètres » (config du bot) et le panneau
    // « Multijoueur » (session à code) dans le shell ; pilotés par le jeu.
    settings: true,
    multiplayer: true,
    controls: [
      { keys: '<kbd>↑ ↓</kbd> ou <kbd>Z S</kbd>', action: 'Déplacer ta raquette' },
      { keys: 'Glisser / souris', action: 'Déplacer ta raquette' },
      { keys: 'But', action: 'Marquer en passant la raquette adverse' },
    ],
  },
];

// Dev/preview equivalent of render.yaml's clean-URL rewrites. Without it Vite's
// SPA fallback serves the home page for every clean game URL. Two steps:
//   1. `/<key>`  -> 301 to `/<key>/` so the page-relative module script
//      (`./<key>-main.ts`) resolves against the game folder, not the site root
//      (otherwise the page renders but the game's JS 404s — "just the front").
//   2. `/<key>/` -> internally serve the real file `/<key>/index.html`.
const games_keys = new Set(games.map((g) => g.key));
interface RewriteRes {
  writeHead(status: number, headers: Record<string, string>): void;
  end(): void;
}
function rewriteCleanUrl(req: { url?: string }, res: RewriteRes, next: () => void): void {
  if (req.url) {
    const [path, rest = ''] = req.url.split(/(?=[?#])/);
    const key = path.replace(/^\//, '').replace(/\/$/, '');
    if (games_keys.has(key)) {
      if (!path.endsWith('/')) {
        res.writeHead(301, { Location: `/${key}/${rest}` });
        res.end();
        return;
      }
      req.url = `/${key}/index.html${rest}`;
    }
  }
  next();
}

export default defineConfig({
  // The HTML pages (= entry points) live in src/, co-located with their code.
  // `publicDir` and `outDir` stay at the project root.
  root: srcRoot,
  publicDir: resolve(projectRoot, 'public'),
  // Multi-page app: disable the SPA fallback that would otherwise serve the home
  // index.html for any unmatched route (the bug where game URLs showed the home).
  appType: 'mpa',
  plugins: [
    // Clean URLs in dev & preview, mirroring render.yaml's rewrites in prod.
    {
      name: 'gameszone-clean-urls',
      configureServer(server) {
        server.middlewares.use(rewriteCleanUrl);
      },
      configurePreviewServer(server) {
        server.middlewares.use(rewriteCleanUrl);
      },
    },
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
