import { PacmanGame } from './PacmanGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Point d'entrée de la page Pac-Man : instancie et démarre le jeu. */
bootstrapGame('pacmanGame', () => new PacmanGame({ gameSpeed: 200 }));
