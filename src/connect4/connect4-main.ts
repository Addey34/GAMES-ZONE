import { Connect4Game } from './Connect4Game.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/** Entry point of the Connect 4 page: instantiates the game. */
bootstrapGame('connect4Game', () => new Connect4Game());
