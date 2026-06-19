import { TetrisGame } from './TetrisGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Point d'entrée de la page Tetris : instancie et démarre le jeu. */
bootstrapGame('tetrisGame', () => new TetrisGame());
