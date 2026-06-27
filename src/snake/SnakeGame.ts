import { GameEngine, GameConfig } from '../shared/GameEngine.js';
import {
  Direction,
  DIRECTION_DELTAS,
  OPPOSITE_DIRECTION,
  keyboardDirection,
  setupSwipe,
} from '../shared/input.js';

/**
 * Configuration specific to the Snake game.
 */
interface SnakeConfig extends GameConfig {
  /** Number of cells per side. A larger grid = easier game. */
  gridSize?: number;
  /** Initial interval between two moves, in ms. */
  baseSpeed?: number;
  /** Minimum interval (max speed) reached when accelerating, in ms. */
  minSpeed?: number;
  /** Factor applied to the interval on each food eaten (<1 = speeds up). */
  speedFactor?: number;
}

/**
 * Coordinates of a cell on the grid (1-indexed).
 */
interface Position {
  x: number;
  y: number;
}

/**
 * The snake: its queue of segments, its direction and its movement logic.
 *
 * The body "wraps" at the grid edges (crossing a wall = reappearing on the
 * opposite side).
 */
export class Snake {
  private body: Position[];
  private velocity: Position;
  /** Direction actually travelled on the last move (the "committed" one). */
  private direction: Direction;
  /** Latest requested direction, applied at most once per move. */
  private nextDirection: Direction;
  /** Becomes true on the first input: the snake stays still until then. */
  private started: boolean = false;
  private gridSize: number;

  /**
   * Creates a one-segment snake at a random position, facing right.
   * @param gridSize Grid size (number of cells per side).
   */
  constructor(gridSize: number) {
    this.gridSize = gridSize;
    this.body = [
      {
        x: Math.floor(Math.random() * gridSize) + 1,
        y: Math.floor(Math.random() * gridSize) + 1,
      },
    ];
    this.velocity = { x: 0, y: 0 };
    this.direction = 'right';
    this.nextDirection = 'right';
  }

  /**
   * Moves the snake forward by one cell. Grows the body if the food is eaten,
   * otherwise removes the last segment (constant length).
   * @returns `true` if the food was eaten on this move.
   */
  move(food: Position): boolean {
    // Commit at most one queued direction change per move, rejecting a 180°
    // reversal relative to the direction actually travelled last move. Doing
    // this here (not in setDirection) stops two quick key presses within the
    // same move interval from chaining into a U-turn that makes the snake cross
    // itself. The snake stays still until the first input (started === false).
    if (this.started && OPPOSITE_DIRECTION[this.nextDirection] !== this.direction) {
      this.direction = this.nextDirection;
      this.velocity = { ...DIRECTION_DELTAS[this.direction] };
    }

    const head = this.body[0];
    const newHead: Position = {
      x: this.wrapPosition(head.x + this.velocity.x),
      y: this.wrapPosition(head.y + this.velocity.y),
    };

    this.body.unshift(newHead);
    const hasEaten = this.checkFoodCollision(food);
    if (!hasEaten) {
      this.body.pop();
    }
    return hasEaten;
  }

  /**
   * Folds an off-grid coordinate back onto the opposite edge ("wrap" effect).
   */
  private wrapPosition(pos: number): number {
    if (pos <= 0) return this.gridSize;
    if (pos > this.gridSize) return 1;
    return pos;
  }

  /**
   * Detects a collision of the head with the body. The first four segments
   * (indices 0 to 3) are ignored: since the U-turn is forbidden, it takes at
   * least a 2×2-cell loop (4 moves) for the head to reach a body cell — segment
   * at index 4 is therefore the first one that can coincide.
   */
  checkCollision(): boolean {
    const head = this.body[0];
    for (let i = 4; i < this.body.length; i++) {
      const segment = this.body[i];
      if (head.x === segment.x && head.y === segment.y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Tells whether the head is on the food cell.
   */
  private checkFoodCollision(food: Position): boolean {
    const head = this.body[0];
    return head.x === food.x && head.y === food.y;
  }

  /**
   * Changes the snake's direction. The U-turn is ignored: the snake cannot turn
   * back on itself.
   */
  setDirection(newDirection: Direction): void {
    // Only record the request; it is validated and applied once per move (see
    // move()), so multiple presses between two moves cannot chain into a 180°
    // reversal that makes the snake cross itself.
    this.started = true;
    this.nextDirection = newDirection;
  }

  /** Returns the body segments (head at the front of the list). */
  getBody(): Position[] {
    return this.body;
  }

  /** Returns the current direction. */
  getDirection(): Direction {
    return this.direction;
  }
}

/**
 * The food: a cell that never overlaps the snake.
 */
export class Food {
  /** Available mouse variants (match the CSS classes .food--*). */
  private static readonly VARIANTS = ['gray', 'brown', 'white'] as const;

  private position: Position;
  private snake: Snake;
  private gridSize: number;
  /** Current mouse variant, drawn at random on each respawn. */
  private variant: string = Food.VARIANTS[0];

  /**
   * @param snake Snake to avoid when placing.
   * @param gridSize Grid size.
   */
  constructor(snake: Snake, gridSize: number) {
    this.snake = snake;
    this.gridSize = gridSize;
    this.position = { x: 0, y: 0 };
    this.randomize();
  }

  /**
   * Moves the food to a random free cell (outside the snake body) and draws a
   * new mouse variant.
   */
  randomize(): void {
    do {
      this.position = {
        x: Math.floor(Math.random() * this.gridSize) + 1,
        y: Math.floor(Math.random() * this.gridSize) + 1,
      };
    } while (this.isOnSnake());

    this.variant = Food.VARIANTS[Math.floor(Math.random() * Food.VARIANTS.length)];
  }

  /**
   * Tells whether the current position overlaps a snake segment.
   */
  private isOnSnake(): boolean {
    return this.snake
      .getBody()
      .some((segment) => segment.x === this.position.x && segment.y === this.position.y);
  }

  /** Returns the food position. */
  getPosition(): Position {
    return this.position;
  }

  /** Returns the current mouse variant (CSS class suffix .food--*). */
  getVariant(): string {
    return this.variant;
  }
}

/**
 * Snake game.
 *
 * The snake moves on a square grid at a fixed rate (independent of the render
 * loop's 60 fps); each food eaten earns points and speeds up the game down to a
 * speed floor.
 */
export class SnakeGame extends GameEngine {
  private snake: Snake;
  private food: Food;
  private gridSize: number;
  private playBoard: HTMLElement | null = null;
  /** Effects layer overlaid on the board (not cleared every frame). */
  private fxLayer: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /** Points earned per mouse eaten. */
  private static readonly FOOD_POINTS = 10;

  /** Base interval between two moves (ms). */
  private readonly baseInterval: number;
  /** Minimum interval reachable when accelerating (ms). */
  private readonly minInterval: number;
  /** Interval reduction factor on each food (<1 = speeds up). */
  private readonly speedFactor: number;
  /** Current move interval (ms). */
  private moveInterval: number;
  /** Time accumulated since the last move (ms). */
  private moveAccumulator: number = 0;

  /**
   * @param config Game configuration (grid size, speeds…).
   */
  constructor(config: SnakeConfig = {}) {
    super({ ...config, storageKey: 'snake-high-scores', leaderboardId: 'snake' });
    this.gridSize = config.gridSize || 25;
    this.baseInterval = config.baseSpeed || 200;
    this.minInterval = config.minSpeed || 75;
    this.speedFactor = config.speedFactor || 0.93;
    this.moveInterval = this.baseInterval;

    this.snake = new Snake(this.gridSize);
    this.food = new Food(this.snake, this.gridSize);
  }

  /**
   * Binds the DOM elements, sizes the CSS grid from the game's logical size,
   * wires up the keyboard and performs the first render.
   */
  initialize(): void {
    this.playBoard = document.querySelector('.play-board');
    this.scoreElement = document.querySelector('.score');
    this.highScoreElement = document.querySelector('.high-score');

    if (this.playBoard) {
      this.playBoard.style.gridTemplate = `repeat(${this.gridSize}, 1fr) / repeat(${this.gridSize}, 1fr)`;
      this.fxLayer = document.createElement('div');
      this.fxLayer.className = 'snake-fx';
      this.playBoard.appendChild(this.fxLayer);

      // Touch control (mobile): swiping on the board steers the snake.
      setupSwipe(this.playBoard, {
        onSwipe: (direction) => {
          if (!this.state.isGameOver) this.snake.setDirection(direction);
        },
      });
    }

    this.setupEventListeners();
    this.updateScoreDisplay();
    this.renderScoreTable();
    this.render();
  }

  /**
   * Moves the snake at the `moveInterval` rate (not every frame): handles eating
   * food, acceleration and collision detection.
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;

    this.moveAccumulator += deltaTime;
    if (this.moveAccumulator < this.moveInterval) return;
    this.moveAccumulator = 0;

    const hasEaten = this.snake.move(this.food.getPosition());

    if (hasEaten) {
      this.addScore(SnakeGame.FOOD_POINTS);
      this.spawnScoreFloat(this.food.getPosition(), SnakeGame.FOOD_POINTS);
      this.food.randomize();
      this.increaseSpeed();
    }

    if (this.snake.checkCollision()) {
      this.gameOver();
    }
  }

  /**
   * Reduces the move interval (progressive difficulty), without going below
   * `minInterval` to stay playable.
   */
  private increaseSpeed(): void {
    this.moveInterval = Math.max(this.minInterval, this.moveInterval * this.speedFactor);
  }

  /**
   * Rebuilds the board: snake segments (head vs body) then the food, positioned
   * via the CSS grid.
   */
  render(): void {
    if (!this.playBoard) return;

    // We only clear the snake and the mouse: the effects layer (.snake-fx)
    // and its ongoing animations must survive from one frame to the next.
    this.playBoard.querySelectorAll('.snake-head, .snake-body, .food').forEach((el) => el.remove());

    this.snake.getBody().forEach((segment, index) => {
      const snakeElement = document.createElement('div');
      snakeElement.style.gridRowStart = segment.y.toString();
      snakeElement.style.gridColumnStart = segment.x.toString();
      snakeElement.className =
        index === 0 ? `snake-head ${this.snake.getDirection()}` : 'snake-body';
      this.playBoard!.appendChild(snakeElement);
    });

    const foodPosition = this.food.getPosition();
    const foodElement = document.createElement('div');
    foodElement.style.gridRowStart = foodPosition.y.toString();
    foodElement.style.gridColumnStart = foodPosition.x.toString();
    foodElement.className = `food food--${this.food.getVariant()}`;
    foodElement.innerHTML = `
      <div class="food-ear left"></div>
      <div class="food-ear right"></div>
      <div class="food-body"></div>
      <div class="food-eye left"></div>
      <div class="food-eye right"></div>
      <div class="food-nose"></div>
      <div class="food-tail"></div>
    `;
    this.playBoard!.appendChild(foodElement);
  }

  /**
   * Spawns a floating "+N" on the given cell, in the effects layer. The element
   * removes itself at the end of its CSS animation.
   */
  private spawnScoreFloat(pos: Position, points: number): void {
    if (!this.fxLayer) return;

    const float = document.createElement('div');
    float.className = 'score-float';
    float.textContent = `+${points}`;
    // Center of the targeted cell, as a percentage of the board.
    float.style.left = `${((pos.x - 0.5) / this.gridSize) * 100}%`;
    float.style.top = `${((pos.y - 0.5) / this.gridSize) * 100}%`;
    float.addEventListener('animationend', () => float.remove());

    this.fxLayer.appendChild(float);
  }

  /**
   * Translates the key into a direction and steers the snake (arrows/ZQSD do
   * not scroll the page).
   */
  handleInput(event: KeyboardEvent): void {
    if (this.state.isGameOver) return;

    const direction = keyboardDirection(event);
    if (direction) {
      event.preventDefault();
      this.snake.setDirection(direction);
    }
  }

  /**
   * Recreates the snake and the food and resets score, speed and state to zero.
   */
  reset(): void {
    this.snake = new Snake(this.gridSize);
    this.food = new Food(this.snake, this.gridSize);
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.moveInterval = this.baseInterval;
    this.moveAccumulator = 0;
    if (this.fxLayer) this.fxLayer.innerHTML = '';
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Shows the current score and the high score in the game header.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `Score: ${this.state.score}`;
    }
    if (this.highScoreElement) {
      this.highScoreElement.textContent = `High Score: ${this.scoreManager.getHighScore()}`;
    }
  }
}
