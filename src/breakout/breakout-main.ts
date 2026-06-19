import { BreakoutGame } from './BreakoutGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Point d'entrée de la page Casse-brique : instancie et démarre le jeu. */
bootstrapGame('breakoutGame', () => new BreakoutGame());
