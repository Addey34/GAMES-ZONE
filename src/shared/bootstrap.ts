import { GameEngine } from './GameEngine.js';

/**
 * Options de démarrage d'un jeu.
 */
interface BootstrapOptions {
  /** Démarrer la boucle après l'initialisation (défaut : true). */
  autoStart?: boolean;
}

/**
 * Démarrage commun à tous les jeux.
 *
 * Au `DOMContentLoaded`, instancie le jeu via `factory`, l'initialise
 * (`initialize()` peut être asynchrone), lance la boucle (sauf si
 * `autoStart: false`), puis expose l'instance sur `window[globalName]` pour le
 * débogage.
 *
 * @param globalName Nom sous lequel exposer l'instance sur `window`.
 * @param factory Fabrique créant l'instance du jeu.
 * @param options Options de démarrage.
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
