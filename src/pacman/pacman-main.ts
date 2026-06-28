import { PacmanGame } from './PacmanGame.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/**
 * Entry point of the Pac-Man page: instantiates and starts the game.
 * `difficulty` sets the initial ghost AI tier ('easy' = original random ghosts,
 * 'medium', 'hard'); the Niveaux panel then ramps it as the level rises.
 */
bootstrapGame('pacmanGame', () => new PacmanGame({ gameSpeed: 200, difficulty: 'medium' }));
