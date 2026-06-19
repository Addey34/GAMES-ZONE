import { SnakeGame } from './SnakeGame.js';
import { bootstrapGame } from '../shared/bootstrap.js';

/** Point d'entrée de la page Snake : instancie et démarre le jeu. */
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
