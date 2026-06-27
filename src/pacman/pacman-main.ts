import { PacmanGame } from './PacmanGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/**
 * Entry point of the Pac-Man page: instantiates and starts the game.
 * `difficulty` tunes the ghost AI ('easy' = original random ghosts, 'medium',
 * 'hard'); a difficulty selector can be wired to it later.
 */
bootstrapGame('pacmanGame', () => new PacmanGame({ gameSpeed: 200, difficulty: 'medium' }));
