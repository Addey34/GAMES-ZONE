import { MemoryGame } from './MemoryGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Point d'entrée de la page Memory : instancie et démarre le jeu. */
bootstrapGame('memoryGame', () => new MemoryGame({ gridSize: 4 }));
