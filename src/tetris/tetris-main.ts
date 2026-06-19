import { TetrisGame } from './TetrisGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Entry point of the Tetris page: instantiates and starts the game. */
bootstrapGame('tetrisGame', () => new TetrisGame());
