import { LudoGame } from './LudoGame.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/** Entry point of the Ludo page: instantiates the game. */
bootstrapGame('ludoGame', () => new LudoGame());
