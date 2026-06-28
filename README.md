# 🎮 GamesZone

A collection of browser arcade games gathered into a single web app. Scores are saved
locally in the browser (`localStorage`) **and**, when available, in **online leaderboards**
on a self-hosted backend — online is best-effort, with `localStorage` as the always-working
fallback.

> Note: the user-facing interface is in French.

## Available games

- ⌨️ **Dactylographie** (Typing) — fast-typing practice
- 🐍 **Snake**
- 🟡 **Pacman** — with selectable difficulty levels
- 🔢 **2048**
- 🧱 **Tetris**
- 🃏 **Memory** — solo, vs a bot, or 1-v-1 online
- 🧱 **Breakout** (Casse-brique)
- 🏓 **Pong** — vs a bot or 1-v-1 online

## Controls

Every game can be played with the **keyboard** (arrow keys **or** ZQSD/WASD) and **by
touch** (swipe on mobile); the paddle games (Breakout, Pong) also support the **mouse**.
A help button "ⓘ" recalls each game's controls, and a **zen mode** button hides all the
chrome to focus on the board (with best-effort native fullscreen).

## Online features

- **Online leaderboards** — global scores for Snake, 2048, Tetris and Dactylographie.
- **Google sign-in** — optional; players are anonymous by default and can sign in to carry
  their scores across devices.
- **Levels & progression** — Pac-Man's difficulty tiers, synced across devices.
- **Online multiplayer** — Pong and Memory can be played 1-v-1 over the network via a short
  session code (relayed, host-authoritative); they stay fully playable solo if offline.

The backend is a self-hosted [Nakama](https://heroiclabs.com/nakama/) server; the frontend
talks to it only through a thin best-effort wrapper, so the app never breaks if it is
unreachable.

## Tech stack

- [Vite](https://vitejs.dev/) — multi-page app (one page per game)
- **TypeScript** (`strict` mode)
- [Handlebars](https://handlebarsjs.com/) — shared HTML partials (head, navigation, shell)
- Modular CSS (design tokens, mobile-first), no framework
- [Nakama](https://heroiclabs.com/nakama/) — online leaderboards, auth, storage & realtime
  multiplayer (best-effort)
- [Vitest](https://vitest.dev/) — unit tests; **ESLint** + **Prettier** — quality and format
- Continuous integration (GitHub Actions): format, lint, build + tests on every push / pull
  request

## Getting started

Requirement: [Node.js](https://nodejs.org/).

```bash
npm install      # install dependencies
npm run dev      # dev server on http://localhost:3000
```

## Scripts

| Command              | Description                                         |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Development server (hot reload)                     |
| `npm run build`      | Type-check then production build → `dist/`          |
| `npm run preview`    | Serve the production build locally                  |
| `npm run type-check` | Check types without building (`tsc --noEmit`)       |
| `npm test`           | Run unit tests (Vitest)                             |
| `npm run lint`       | Analyze the code (ESLint); `lint:fix` auto-fixes    |
| `npm run format`     | Format the code (Prettier); `format:check` verifies |

## Project structure

```
src/
  index.html            # home page
  <game>/               # one folder per game
    index.html          #   game page (served at the clean URL /<game>)
    <game>-main.ts      #   entry point
    <Game>.ts           #   game logic
  shared/               # shared game framework, split by domain:
    engine/             #   game loop, bootstrap, input
    score/              #   leaderboard manager + panel
    levels/             #   levels model + panel
    net/                #   online backend, auth, realtime match
    ui/                 #   generic DOM chrome (sidebar, overlays, popovers…)
    bot/                #   AI-opponent primitives + per-game bots
    versus/             #   1-v-1 plumbing + multiplayer panel
  partials/             # Handlebars HTML partials (head, navigation, shell)
public/
  css/                  # stylesheets (served from the root)
  icons/                # per-game SVG icons
  words.txt             # word list for the typing game
vite.config.ts          # Vite config + central game list
```

All games extend a common engine (`src/shared/engine/GameEngine.ts`) that owns the game
loop, the score plumbing, and the game-over overlay.

### Adding a game

1. Add one line to the `games` array in `vite.config.ts`.
2. Create `src/<game>/index.html`, `src/<game>/<game>-main.ts`, `src/<game>/<Game>.ts`
   and the icon `public/icons/<game>.svg`.

The game then appears automatically in the navigation and on the home page.

## Contributing

Contributions are welcome! The project works through **Pull Requests**.
See the [CONTRIBUTING.md](CONTRIBUTING.md) guide for the detailed steps
(fork, branch, checks, adding a game).
