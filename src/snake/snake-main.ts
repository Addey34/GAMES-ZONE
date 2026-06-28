import { SnakeGame } from './SnakeGame.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/** Entry point of the Snake page: instantiates and starts the game. */
bootstrapGame(
  'snakeGame',
  () =>
    new SnakeGame({
      gridSize: 25,
      baseSpeed: 200,
      minSpeed: 75,
      speedFactor: 0.93,
    })
);
