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
 * Force la position initiale (aléatoire) du serpent en bridant Math.random.
 * floor(value * gridSize) + 1 ; value=0 → (1,1).
 */
function snakeAt(value: number, gridSize: number): Snake {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(value);
  const snake = new Snake(gridSize);
  spy.mockRestore();
  return snake;
}

/** Allonge le serpent en le nourrissant en ligne droite vers la droite. */
function growRight(snake: Snake, segments: number): void {
  snake.setDirection('right');
  for (let i = 0; i < segments; i++) {
    const head = snake.getBody()[0];
    snake.move({ x: head.x + 1, y: head.y });
  }
}

describe('Snake', () => {
  it('démarre avec un seul segment, orienté à droite', () => {
    const snake = snakeAt(0, 10);
    expect(snake.getBody()).toHaveLength(1);
    expect(snake.getDirection()).toBe('right');
  });

  it('interdit le demi-tour (direction opposée ignorée)', () => {
    const snake = snakeAt(0, 10); // direction initiale : right
    snake.setDirection('left'); // opposé → ignoré
    expect(snake.getDirection()).toBe('right');

    snake.setDirection('up'); // perpendiculaire → accepté
    expect(snake.getDirection()).toBe('up');

    snake.setDirection('down'); // opposé de up → ignoré
    expect(snake.getDirection()).toBe('up');
  });

  it('traverse le bord droit et réapparaît à gauche (wrap)', () => {
    const snake = snakeAt(0.95, 10); // tête en (10,10)
    snake.setDirection('right');
    snake.move({ x: -1, y: -1 }); // nourriture hors-champ
    expect(snake.getBody()[0]).toEqual({ x: 1, y: 10 });
  });

  it('traverse le bord haut et réapparaît en bas (wrap)', () => {
    const snake = snakeAt(0, 10); // tête en (1,1)
    snake.setDirection('up');
    snake.move({ x: -1, y: -1 });
    expect(snake.getBody()[0]).toEqual({ x: 1, y: 10 });
  });

  it('grandit en mangeant et garde sa longueur sinon', () => {
    const snake = snakeAt(0, 10); // tête en (1,1)
    snake.setDirection('right');

    const eaten = snake.move({ x: 2, y: 1 }); // mange
    expect(eaten).toBe(true);
    expect(snake.getBody()).toHaveLength(2);

    const eatenAgain = snake.move({ x: 9, y: 9 }); // ne mange pas
    expect(eatenAgain).toBe(false);
    expect(snake.getBody()).toHaveLength(2);
  });

  it("ne signale pas de collision tant qu'il fait 4 segments ou moins", () => {
    const snake = snakeAt(0, 10);
    growRight(snake, 3); // longueur 4
    expect(snake.getBody()).toHaveLength(4);
    expect(snake.checkCollision()).toBe(false);
  });
});

describe('Food', () => {
  it("n'apparaît jamais sur le corps du serpent", () => {
    const gridSize = 6;
    const snake = snakeAt(0, gridSize);
    growRight(snake, 3); // occupe (1,1)..(4,1)

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
