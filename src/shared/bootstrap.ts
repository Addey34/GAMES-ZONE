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
 * (`initialize()` may be asynchronous), starts the loop (unless
 * `autoStart: false`), then exposes the instance on `window[globalName]` for
 * debugging.
 *
 * @param globalName Name under which to expose the instance on `window`.
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
      game.start();
    }
    (window as unknown as Record<string, unknown>)[globalName] = game;
  });
}
