import { DactylographieGame } from './DactylographieGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/**
 * Point d'entrée de la page Dactylographie.
 *
 * `autoStart: false` : le chrono ne démarre qu'à la première frappe du joueur.
 */
bootstrapGame('dactylographieGame', () => new DactylographieGame({ timeLimit: 60 }), {
  autoStart: false,
});
