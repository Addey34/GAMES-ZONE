import { Game2048 } from './2048Game.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/** Entry point of the 2048 page: instantiates and starts the game. */
bootstrapGame('game2048', () => new Game2048({ gridSize: 4 }));
