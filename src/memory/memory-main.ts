import { MemoryGame } from './MemoryGame.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/** Entry point of the Memory page: instantiates and starts the game. */
bootstrapGame('memoryGame', () => new MemoryGame());
