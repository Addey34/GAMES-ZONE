# 🎮 GamesZone

A collection of browser arcade games gathered into a single web app. No backend:
scores are saved locally in the browser for now (`localStorage`).

> Note: the user-facing interface is currently in French.

## Available games

- ⌨️ **Typing** (Dactylographie) — fast-typing practice
- 🐍 **Snake**
- 🟡 **Pacman**
- 🔢 **2048**
- 🧱 **Tetris**
- 🃏 **Memory**
- 🧱 **Breakout** (Casse-brique)

## Controls

Every game can be played with the **keyboard** (arrow keys **or** ZQSD/WASD) **and by
touch** (swipe on mobile). A help tooltip "ⓘ" (on hover) recalls each game's controls,
and a **fullscreen** button is available.

## Tech stack

- [Vite](https://vitejs.dev/) — multi-page app (one page per game)
- **TypeScript** (`strict` mode)
- [Handlebars](https://handlebarsjs.com/) — shared HTML partials (head, navigation, modal)
- Modular CSS (design tokens, mobile-first), no framework
- [Vitest](https://vitest.dev/) — unit tests; **ESLint** + **Prettier** — quality and format
- Continuous integration (GitHub Actions): build + tests on every push / pull request

## Getting started

Requirement: [Node.js](https://nodejs.org/).

```bash
npm install      # install dependencies
npm run dev      # dev server on http://localhost:3000
```

## Scripts

| Command              | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Development server (hot reload)                         |
| `npm run build`      | Type-check then production build → `dist/`              |
| `npm run preview`    | Serve the production build locally                      |
| `npm run type-check` | Check types without building (`tsc --noEmit`)          |
| `npm test`           | Run unit tests (Vitest)                                 |
| `npm run lint`       | Analyze the code (ESLint); `lint:fix` auto-fixes        |
| `npm run format`     | Format the code (Prettier); `format:check` verifies     |

## Project structure

```
src/
  index.html            # home page
  <game>/               # one folder per game
    index.html          #   game page (served at the clean URL /<game>)
    <game>-main.ts      #   entry point
    <Game>.ts           #   game logic
  shared/               # shared game engine and utilities
  partials/             # Handlebars HTML partials (head, navigation, modal)
public/
  css/                  # stylesheets (served from the root)
  words.txt             # word list for the typing game
vite.config.ts          # Vite config + central game list
```

All games share a common engine (`src/shared/GameEngine.ts`) that handles the game
loop, the score, and the game-over modal.

### Adding a game

1. Add one line to the `games` array in `vite.config.ts`.
2. Create `src/<game>/index.html`, `src/<game>/<game>-main.ts`, `src/<game>/<Game>.ts`
   and the icon `public/icons/<game>.svg`.

The game then appears automatically in the navigation and on the home page.

## Contributing

Contributions are welcome! The project works through **Pull Requests**.
See the [CONTRIBUTING.md](CONTRIBUTING.md) guide for the detailed steps
(fork, branch, checks, adding a game).
</content>
