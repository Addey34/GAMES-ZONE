# Contributing to GamesZone

Thanks for wanting to contribute! 🎮 Whether it's fixing a bug, improving a game, or
adding a new one, all help is welcome.

## In short

The project works through **Pull Requests (PRs)**: you work on your own copy, then
propose your changes. Nobody pushes directly to `main` — every change goes through a PR
validated by continuous integration (CI) before being merged.

## Steps to contribute

1. **Fork** the repository (the "Fork" button at the top right on GitHub): you get your
   own copy.
2. **Clone** your copy to your computer:
   ```bash
   git clone https://github.com/<your-username>/GAMES-ZONE.git
   cd GAMES-ZONE
   ```
3. **Create a branch** for your change (don't work on `main`):
   ```bash
   git checkout -b feat/my-awesome-game
   ```
4. **Install and run** the project:
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   ```
5. **Make your changes**, then run the **same checks as the CI** in a single command:
   ```bash
   npm run verify   # format, lint, build + tests — all must pass
   ```
   If Prettier reports formatting issues, fix them with `npm run format`, then re-run.
6. **Commit and push** to your branch:
   ```bash
   git add .
   git commit -m "Add the Pong game"
   git push origin feat/my-awesome-game
   ```
7. **Open a Pull Request** targeting `main` of the original repository. Describe what you
   did. The CI runs automatically; once green ✅, the PR can be merged.

## Adding a new game

The architecture is designed to make this simple. To add a game `pong`:

1. **One line** in the `games` array of `vite.config.ts`:
   ```ts
   { key: 'pong', label: 'Pong', color: '--color-pong', mode: 'duo', controls: [ /* ... */ ] }
   ```
   - `key` = the folder name (also used as the icon name and the menu active state)
   - `color` = a color token defined in `public/css/base/variables.css`
   - `mode` = the player-count badge in the nav rail: `'solo'`, `'duo'` (1-v-1) or `'multi'` (3+)
2. Create the page and the code in `src/pong/`:
   - `src/pong/index.html` — the page (~15 lines, see an existing game)
   - `src/pong/pong-main.ts` — the entry point (~3 lines)
   - `src/pong/Pong.ts` — the logic, which **extends `GameEngine`** (`src/shared/engine/GameEngine.ts`)
3. Create the icon `public/icons/pong.svg`.

The game then appears **automatically** in the menu and on the home page (everything is
driven by the `games` array). Take inspiration from an existing game such as `snake`.

### Turn-based board games and online play

- A **turn-based** game (like Ludo or Connect 4) supplies its **pure rules** through the
  `TurnRules` model in `src/shared/turn/turnGame.ts` (state + legal moves + a reducer — no DOM,
  no time, so they are fully unit-testable) instead of the real-time loop. Start from
  `src/connect4/` (the simplest reference) or `src/ludo/`.
- To make a game playable **online**, add `settings: true` and `multiplayer: true` to its
  `games` entry and reuse the shared lobby (`versus/multiplayerPanel.ts`). The networking
  (`net/match.ts`) is relayed and **host-authoritative**, so no server change is needed — the
  game stays fully playable solo against bots if the backend is unreachable.

## Best practices

- **One PR = one topic** (one game, one bug, one improvement). The more focused it is,
  the easier it is to review and merge.
- Follow the existing style (TypeScript `strict`, CSS design tokens, mobile-first).
  Formatting is handled by **Prettier** and code style by **ESLint** — run `npm run verify`
  before pushing so the CI passes on the first try.
- Scores persist in `localStorage` and, when a game opts in, in online leaderboards on the
  Nakama backend (best-effort — `localStorage` is always the fallback).
- A question or an idea before coding? Open an **Issue** to discuss it.

Thanks! 🙌
