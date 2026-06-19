import { Game2048 } from './2048Game.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Point d'entrée de la page 2048 : instancie et démarre le jeu. */
bootstrapGame('game2048', () => new Game2048({ gridSize: 4 }));
