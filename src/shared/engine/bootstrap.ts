import { GameEngine } from './GameEngine.js';

/**
 * Startup options for a game.
 */
interface BootstrapOptions {
  /** Start the loop after initialization (default: true). */
  autoStart?: boolean;
}

/**
 * Startup shared by all games.
 *
 * On `DOMContentLoaded`, instantiates the game via `factory`, initializes it
 * (`initialize()` may be asynchronous), and — unless `autoStart: false` — shows
 * the modular Play screen ({@link GameEngine.presentStartScreen}) so the loop
 * only begins on the player's click. In development, exposes the instance on
 * `window[globalName]` for debugging (stripped from production builds).
 *
 * @param globalName Name under which to expose the instance on `window` (dev only).
 * @param factory Factory creating the game instance.
 * @param options Startup options.
 */
export function bootstrapGame(
  globalName: string,
  factory: () => GameEngine,
  options: BootstrapOptions = {}
): void {
  document.addEventListener('DOMContentLoaded', async () => {
    const game = factory();
    await game.initialize();
    if (options.autoStart !== false) {
      game.presentStartScreen();
    }
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>)[globalName] = game;
    }
  });
}
