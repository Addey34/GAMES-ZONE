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
5. **Make your changes**, then **make sure everything passes** (the CI will check this
   anyway):
   ```bash
   npm run format   # format the code
   npm run lint     # analyze the code
   npm test         # unit tests
   npm run build    # type-check + production build
   ```
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
   { key: 'pong', label: 'Pong', color: '--color-pong', controls: [ /* ... */ ] }
   ```
   - `key` = the folder name (also used as the icon name and the menu active state)
   - `color` = a color token defined in `public/css/base/variables.css`
2. Create the page and the code in `src/pong/`:
   - `src/pong/index.html` — the page (~15 lines, see an existing game)
   - `src/pong/pong-main.ts` — the entry point (~3 lines)
   - `src/pong/Pong.ts` — the logic, which **extends `GameEngine`** (`src/shared/GameEngine.ts`)
3. Create the icon `public/icons/pong.svg`.

The game then appears **automatically** in the menu and on the home page (everything is
driven by the `games` array). Take inspiration from an existing game such as `snake`.

## Best practices

- **One PR = one topic** (one game, one bug, one improvement). The more focused it is,
  the easier it is to review and merge.
- Follow the existing style (TypeScript `strict`, CSS design tokens, mobile-first).
  Formatting is handled by **Prettier** and code style by **ESLint** — run them before
  pushing.
- No backend: scores stay in `localStorage`.
- A question or an idea before coding? Open an **Issue** to discuss it.

Thanks! 🙌
</content>
