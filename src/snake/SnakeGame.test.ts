import { afterEach, describe, expect, it, vi } from 'vitest';
import { Food, Snake } from './SnakeGame.js';

interface Position {
  x: number;
  y: number;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Forces the snake's (random) initial position by constraining Math.random.
 * floor(value * gridSize) + 1; value=0 → (1,1).
 */
function snakeAt(value: number, gridSize: number): Snake {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(value);
  const snake = new Snake(gridSize);
  spy.mockRestore();
  return snake;
}

/** Grows the snake by feeding it in a straight line to the right. */
function growRight(snake: Snake, segments: number): void {
  snake.setDirection('right');
  for (let i = 0; i < segments; i++) {
    const head = snake.getBody()[0];
    snake.move({ x: head.x + 1, y: head.y });
  }
}

describe('Snake', () => {
  it('starts with a single segment, facing right', () => {
    const snake = snakeAt(0, 10);
    expect(snake.getBody()).toHaveLength(1);
    expect(snake.getDirection()).toBe('right');
  });

  it('applies a direction change only on the next move', () => {
    const snake = snakeAt(0, 10); // facing right
    snake.setDirection('up'); // queued, not applied yet
    expect(snake.getDirection()).toBe('right');

    snake.move({ x: -1, y: -1 }); // commit happens here
    expect(snake.getDirection()).toBe('up');
  });

  it('forbids the U-turn (reversal rejected at move time)', () => {
    const snake = snakeAt(0, 10); // facing right, head (1,1)
    snake.setDirection('right');
    snake.move({ x: -1, y: -1 }); // now travelling right, head (2,1)

    snake.setDirection('left'); // opposite of right → rejected
    snake.move({ x: -1, y: -1 });
    expect(snake.getDirection()).toBe('right');
    expect(snake.getBody()[0]).toEqual({ x: 3, y: 1 }); // kept going right
  });

  it('cannot reverse via two quick inputs within the same tick (regression)', () => {
    const snake = snakeAt(0, 10); // facing right, head (1,1)
    snake.setDirection('right');
    snake.move({ x: -1, y: -1 }); // travelling right, head (2,1)

    // Going right, press up then left before the next move. Naively chaining
    // these (up then left, since left is not opposite of up) would flip the
    // snake to 'left' and make it cross itself. It must stay on course.
    snake.setDirection('up');
    snake.setDirection('left');
    snake.move({ x: -1, y: -1 });

    expect(snake.getDirection()).toBe('right');
    expect(snake.getBody()[0]).toEqual({ x: 3, y: 1 });
  });

  it('crosses the right edge and reappears on the left (wrap)', () => {
    const snake = snakeAt(0.95, 10); // head at (10,10)
    snake.setDirection('right');
    snake.move({ x: -1, y: -1 }); // food off-screen
    expect(snake.getBody()[0]).toEqual({ x: 1, y: 10 });
  });

  it('crosses the top edge and reappears at the bottom (wrap)', () => {
    const snake = snakeAt(0, 10); // head at (1,1)
    snake.setDirection('up');
    snake.move({ x: -1, y: -1 });
    expect(snake.getBody()[0]).toEqual({ x: 1, y: 10 });
  });

  it('grows when eating and keeps its length otherwise', () => {
    const snake = snakeAt(0, 10); // head at (1,1)
    snake.setDirection('right');

    const eaten = snake.move({ x: 2, y: 1 }); // eats
    expect(eaten).toBe(true);
    expect(snake.getBody()).toHaveLength(2);

    const eatenAgain = snake.move({ x: 9, y: 9 }); // does not eat
    expect(eatenAgain).toBe(false);
    expect(snake.getBody()).toHaveLength(2);
  });

  it('does not report a collision while it is 4 segments or fewer', () => {
    const snake = snakeAt(0, 10);
    growRight(snake, 3); // length 4
    expect(snake.getBody()).toHaveLength(4);
    expect(snake.checkCollision()).toBe(false);
  });
});

describe('Food', () => {
  it('never appears on the snake body', () => {
    const gridSize = 6;
    const snake = snakeAt(0, gridSize);
    growRight(snake, 3); // occupies (1,1)..(4,1)

    const food = new Food(snake, gridSize);
    const body: Position[] = snake.getBody();

    for (let i = 0; i < 200; i++) {
      food.randomize();
      const pos = food.getPosition();
      const overlaps = body.some((s) => s.x === pos.x && s.y === pos.y);
      expect(overlaps).toBe(false);
    }
  });
});
