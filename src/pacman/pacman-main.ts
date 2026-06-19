import { PacmanGame } from './PacmanGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Entry point of the Pac-Man page: instantiates and starts the game. */
bootstrapGame('pacmanGame', () => new PacmanGame({ gameSpeed: 200 }));
