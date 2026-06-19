import { BreakoutGame } from './BreakoutGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Entry point of the Breakout page: instantiates and starts the game. */
bootstrapGame('breakoutGame', () => new BreakoutGame());
