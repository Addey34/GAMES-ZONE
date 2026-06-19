import { MemoryGame } from './MemoryGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Entry point of the Memory page: instantiates and starts the game. */
bootstrapGame('memoryGame', () => new MemoryGame({ gridSize: 4 }));
