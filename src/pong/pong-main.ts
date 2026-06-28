import { PongGame } from './PongGame.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/** Entry point of the Pong page: instantiates and starts the game. */
bootstrapGame('pongGame', () => new PongGame());
