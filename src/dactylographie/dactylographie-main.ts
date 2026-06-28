import { DactylographieGame } from './DactylographieGame.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/**
 * Entry point of the Dactylographie page.
 *
 * `autoStart: false`: the timer only starts on the player's first keystroke.
 */
bootstrapGame('dactylographieGame', () => new DactylographieGame({ timeLimit: 60 }), {
  autoStart: false,
});
