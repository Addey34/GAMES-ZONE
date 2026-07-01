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
// `mode` = the player-count badge shown next to the rail label: 'solo' (1
// player), 'duo' (1-v-1) or 'multi' (3+); rendered by sidebar.hbs.
// `controls` = { keys, action } lines shown in the "How to play" help
// (the "i" button), rendered by shell-open via the per-page context (see below).
// `keys` may contain <kbd>…</kbd> HTML (rendered unescaped, trusted content
// defined here) to display real keys; e.g. arrows + WASD.
// `levels: true` (optional) renders the shell's collapsible "Levels" panel for
// that game; the level set + unlock rules are declared in the game's own code.
// `leaderboard: true` (optional) renders the collapsible "Leaderboard" panel
// (hosting the score table); omit it for games where a high-score board makes no
// sense (e.g. Pac-Man, which is level-based).
// `speed: true` (optional) adds the typing game's extra "Speed" column to that
// leaderboard table.
// `settings: true` (optional) renders the shell's "Settings" popover (filled by
// ui/settingsPanel.ts; e.g. Pong's bot difficulty + win score).
// `multiplayer: true` (optional) renders the shell's "Multiplayer" popover for
// relayed 1-v-1 sessions (versus/multiplayerPanel.ts; e.g. Pong).
// =============================================================================
const games = [
  {
    key: 'typing',
    label: 'Typing',
    color: '--color-typing',
    mode: 'solo',
    leaderboard: true,
    speed: true,
    controls: [
      { keys: 'Type', action: 'Retype the displayed words' },
      { keys: 'Timer', action: 'Starts on the first letter' },
    ],
  },
  {
    key: 'snake',
    label: 'Snake',
    color: '--color-snake',
    mode: 'solo',
    leaderboard: true,
    controls: [
      { keys: '<kbd>↑ ↓ ← →</kbd> or <kbd>W A S D</kbd>', action: 'Steer the snake' },
      { keys: 'Swipe (mobile)', action: 'Steer the snake with your finger' },
      { keys: 'Goal', action: 'Eat the mice, avoid your tail' },
    ],
  },
  {
    key: 'pacman',
    label: 'Pacman',
    color: '--color-pacman',
    mode: 'solo',
    // Drives the shell's "Levels" panel (the level config itself lives in
    // PacmanGame); set `levels: true` on any game that opts into level selection.
    levels: true,
    controls: [
      { keys: '<kbd>↑ ↓ ← →</kbd> or <kbd>W A S D</kbd>', action: 'Move Pac-Man' },
      { keys: 'Swipe (mobile)', action: 'Move Pac-Man with your finger' },
      { keys: 'Goal', action: 'Eat all the pellets' },
    ],
  },
  {
    key: '2048',
    label: '2048',
    color: '--color-2048',
    mode: 'solo',
    leaderboard: true,
    controls: [
      { keys: '<kbd>↑ ↓ ← →</kbd> or <kbd>W A S D</kbd>', action: 'Slide the tiles' },
      { keys: 'Swipe (mobile)', action: 'Slide the tiles with your finger' },
      { keys: 'Goal', action: 'Merge tiles to reach 2048' },
    ],
  },
  {
    key: 'tetris',
    label: 'Tetris',
    color: '--color-tetris',
    mode: 'solo',
    leaderboard: true,
    controls: [
      { keys: '<kbd>← →</kbd> or <kbd>A D</kbd>', action: 'Move the piece' },
      { keys: '<kbd>↑</kbd> or <kbd>W</kbd> (or tap)', action: 'Rotate' },
      { keys: '<kbd>↓</kbd> or <kbd>S</kbd>', action: 'Soft drop' },
      { keys: '<kbd>Space</kbd>', action: 'Hard drop' },
      { keys: 'Swipe (mobile)', action: '← → to move, ↓ to drop' },
    ],
  },
  {
    key: 'memory',
    label: 'Memory',
    color: '--color-memory',
    mode: 'duo',
    settings: true,
    multiplayer: true,
    controls: [
      { keys: 'Click / tap', action: 'Flip two cards' },
      { keys: 'Pair', action: 'Found → you play again (+1)' },
      { keys: 'Timer', action: '15 s per turn, otherwise an auto move' },
      { keys: 'Goal', action: 'More pairs than your opponent' },
    ],
  },
  {
    key: 'breakout',
    label: 'Breakout',
    color: '--color-breakout',
    mode: 'solo',
    controls: [
      { keys: '<kbd>← →</kbd> or <kbd>A D</kbd>', action: 'Move the paddle' },
      { keys: 'Drag / mouse', action: 'Move the paddle' },
      { keys: 'Goal', action: 'Destroy all the bricks' },
    ],
  },
  {
    key: 'pong',
    label: 'Pong',
    color: '--color-pong',
    mode: 'duo',
    // Enables the shell's "Settings" popover (bot config) and the "Multiplayer"
    // panel (code-based session); both driven by the game.
    settings: true,
    multiplayer: true,
    controls: [
      { keys: '<kbd>↑ ↓</kbd> or <kbd>W S</kbd>', action: 'Move your paddle' },
      { keys: 'Drag / mouse', action: 'Move your paddle' },
      { keys: 'Goal', action: 'Score past the opponent paddle' },
    ],
  },
  {
    key: 'ludo',
    label: 'Ludo',
    color: '--color-ludo',
    mode: 'multi',
    // "Settings" popover (bot difficulty) + "Multiplayer" panel (up to 4 players
    // over the relay); both driven by the game.
    settings: true,
    multiplayer: true,
    controls: [
      { keys: 'Die', action: 'Rolled automatically on your turn' },
      { keys: 'Click / tap', action: 'Choose which horse to move' },
      { keys: '<kbd>6</kbd>', action: 'Brings a horse out of the stable and rolls again' },
      { keys: 'Goal', action: 'Bring your 4 horses home to the center' },
    ],
  },
  {
    key: 'connect4',
    label: 'Connect 4',
    color: '--color-connect4',
    mode: 'duo',
    // Turn-based 2-player: "Settings" popover (bot difficulty) + "Multiplayer"
    // panel (1-v-1 over the relay); both driven by the game.
    settings: true,
    multiplayer: true,
    controls: [
      { keys: 'Click / tap', action: 'Drop a disc in a column' },
      { keys: '<kbd>← →</kbd>', action: 'Aim a column' },
      { keys: '<kbd>↓</kbd> / <kbd>Enter</kbd>', action: 'Drop the disc' },
      { keys: 'Goal', action: 'Line up four of your discs in a row' },
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
