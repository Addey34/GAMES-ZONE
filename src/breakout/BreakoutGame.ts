import { GameEngine, GameConfig } from '../shared/GameEngine.js';

/**
 * Configuration specific to Breakout.
 */
interface BreakoutConfig extends GameConfig {
  /** Number of brick rows (default: 5). */
  brickRows?: number;
  /** Number of brick columns (default: 9). */
  brickCols?: number;
  /** Number of lives at the start (default: 3). */
  lives?: number;
}

/**
 * The ball, in logical board coordinates (0–100 on each axis). `vx`/`vy` are
 * expressed in units per millisecond.
 */
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * A brick: its logical position/size, its state and its row (color/points).
 */
interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  row: number;
}

/* --- Logical board geometry (100×100 square) --- */
const BOARD = 100;
const BALL_R = 1.6;
const PADDLE_W = 16;
const PADDLE_H = 2.5;
const PADDLE_Y = 93;
const SIDE_MARGIN = 3;
const TOP_MARGIN = 8;
const BRICK_GAP = 1;
const BRICK_H = 3.5;

/** Base ball speed (units/ms) and acceleration per level. */
const BASE_SPEED = 0.055;
const SPEED_PER_LEVEL = 1.06;
/** Paddle movement speed with the keyboard (units/ms). */
const PADDLE_SPEED = 0.12;
/** Maximum bounce angle on the paddle edges (radians). */
const MAX_BOUNCE_ANGLE = (60 * Math.PI) / 180;

/**
 * Breakout.
 *
 * A ball bounces in a square board; the player moves a paddle at the bottom
 * (arrows/A-D or mouse) to send it back and destroy all the bricks. The return
 * angle depends on the impact point on the paddle. Missing the ball costs a
 * life; clearing the board moves to the next level (bricks regenerated, faster
 * ball). The game ends when no life is left.
 *
 * The game reuses the engine's `requestAnimationFrame` loop: the ball advances
 * proportionally to the `deltaTime` (in small steps to avoid going through a
 * brick at high speed), independently of the render's 60 fps.
 */
export class BreakoutGame extends GameEngine {
  private readonly brickRows: number;
  private readonly brickCols: number;
  private readonly maxLives: number;

  private ball: Ball = { x: 50, y: 80, vx: 0, vy: 0 };
  /** Position of the paddle's center on the x axis. */
  private paddleX = 50;
  private bricks: Brick[] = [];
  private lives: number;
  private level = 1;
  private speed = BASE_SPEED;

  /** Movement keys held down. */
  private readonly keys = { left: false, right: false };

  private boardElement: HTMLElement | null = null;
  private brickLayer: HTMLElement | null = null;
  private ballElement: HTMLElement | null = null;
  private paddleElement: HTMLElement | null = null;
  private brickElements: HTMLElement[] = [];

  private scoreElement: HTMLElement | null = null;
  private livesElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /**
   * @param config Game configuration (brick rows/columns, lives).
   */
  constructor(config: BreakoutConfig = {}) {
    super({ ...config, storageKey: 'breakout-high-scores', leaderboardId: 'breakout' });
    this.brickRows = config.brickRows || 5;
    this.brickCols = config.brickCols || 9;
    this.maxLives = config.lives || 3;
    this.lives = this.maxLives;
  }

  /**
   * Binds the DOM elements, builds the board (paddle, ball, bricks), wires up
   * the controls, then performs the first render and launches the ball.
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.livesElement = document.querySelector('.lives');
    this.highScoreElement = document.querySelector('.high-score');

    this.buildBoard();
    this.setupEventListeners();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.resetBall();
    this.render();
  }

  /**
   * Wires up the controls specific to this game: holding the arrows/A-D
   * (continuous movement handled in {@link update}) and following the mouse/finger
   * on the board, instead of the engine's one-shot keyboard listening.
   */
  protected setupEventListeners(): void {
    document.addEventListener('keydown', (e) => this.setKey(e, true));
    document.addEventListener('keyup', (e) => this.setKey(e, false));
    this.boardElement?.addEventListener('pointermove', (e) => this.onPointerMove(e));
  }

  /**
   * Updates the state of a movement key (and prevents the page from scrolling on
   * the arrows).
   */
  private setKey(event: KeyboardEvent, pressed: boolean): void {
    if (this.isFormFieldTarget(event.target)) return;

    if (event.code === 'ArrowLeft' || event.code === 'KeyA' || event.code === 'KeyQ') {
      this.keys.left = pressed;
      event.preventDefault();
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      this.keys.right = pressed;
      event.preventDefault();
    }
  }

  /**
   * Places the paddle's center under the pointer (coordinate converted into
   * logical board units).
   */
  private onPointerMove(event: PointerEvent): void {
    if (!this.boardElement) return;
    const rect = this.boardElement.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    this.paddleX = this.clampPaddle(ratio * BOARD);
  }

  /**
   * Required by the {@link GameEngine} contract: keyboard movement is handled
   * continuously (held keys) in {@link update}, not here.
   */
  handleInput(_event: KeyboardEvent): void {}

  /**
   * Moves the paddle according to the held keys, then advances the ball (in
   * small steps) with bounce and life-loss handling.
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;

    const dt = Math.min(deltaTime, 32);
    this.movePaddle(dt);
    this.moveBall(dt);
  }

  /**
   * Moves the paddle left/right according to the held keys, clamped to the
   * board.
   */
  private movePaddle(dt: number): void {
    let dir = 0;
    if (this.keys.left) dir -= 1;
    if (this.keys.right) dir += 1;
    if (dir !== 0) {
      this.paddleX = this.clampPaddle(this.paddleX + dir * PADDLE_SPEED * dt);
    }
  }

  /**
   * Clamps the paddle's center so it stays entirely within the board.
   */
  private clampPaddle(x: number): number {
    return Math.max(PADDLE_W / 2, Math.min(BOARD - PADDLE_W / 2, x));
  }

  /**
   * Advances the ball by `dt` ms in several sub-steps (at most ~one radius per
   * step) to make collisions reliable at high speed.
   */
  private moveBall(dt: number): void {
    const distance = Math.max(Math.abs(this.ball.vx), Math.abs(this.ball.vy)) * dt;
    const steps = Math.max(1, Math.ceil(distance / BALL_R));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.ball.x += this.ball.vx * stepDt;
      this.ball.y += this.ball.vy * stepDt;

      this.collideWalls();
      this.collidePaddle();
      this.collideBricks();

      if (this.ball.y - BALL_R > BOARD) {
        this.loseLife();
        return;
      }
    }
  }

  /**
   * Bounces off the left, right and top walls (repositions the ball on contact
   * and inverts the relevant velocity component).
   */
  private collideWalls(): void {
    if (this.ball.x - BALL_R <= 0) {
      this.ball.x = BALL_R;
      this.ball.vx = Math.abs(this.ball.vx);
    } else if (this.ball.x + BALL_R >= BOARD) {
      this.ball.x = BOARD - BALL_R;
      this.ball.vx = -Math.abs(this.ball.vx);
    }
    if (this.ball.y - BALL_R <= 0) {
      this.ball.y = BALL_R;
      this.ball.vy = Math.abs(this.ball.vy);
    }
  }

  /**
   * Bounce on the paddle: the return angle depends on the impact point (center =
   * vertical, edges = very steep), which gives the player control.
   */
  private collidePaddle(): void {
    if (this.ball.vy <= 0) return;

    const withinX =
      this.ball.x >= this.paddleX - PADDLE_W / 2 && this.ball.x <= this.paddleX + PADDLE_W / 2;
    const atPaddle =
      this.ball.y + BALL_R >= PADDLE_Y && this.ball.y - BALL_R <= PADDLE_Y + PADDLE_H;

    if (withinX && atPaddle) {
      const offset = (this.ball.x - this.paddleX) / (PADDLE_W / 2);
      const angle = offset * MAX_BOUNCE_ANGLE;
      this.ball.vx = this.speed * Math.sin(angle);
      this.ball.vy = -this.speed * Math.cos(angle);
      this.ball.y = PADDLE_Y - BALL_R;
    }
  }

  /**
   * Destroys the first brick hit and bounces the ball on the axis of least
   * penetration (side vs top/bottom).
   */
  private collideBricks(): void {
    for (let i = 0; i < this.bricks.length; i++) {
      const brick = this.bricks[i];
      if (!brick.alive) continue;

      const overlapsX = this.ball.x + BALL_R > brick.x && this.ball.x - BALL_R < brick.x + brick.w;
      const overlapsY = this.ball.y + BALL_R > brick.y && this.ball.y - BALL_R < brick.y + brick.h;
      if (!overlapsX || !overlapsY) continue;

      const penLeft = this.ball.x + BALL_R - brick.x;
      const penRight = brick.x + brick.w - (this.ball.x - BALL_R);
      const penTop = this.ball.y + BALL_R - brick.y;
      const penBottom = brick.y + brick.h - (this.ball.y - BALL_R);
      const minX = Math.min(penLeft, penRight);
      const minY = Math.min(penTop, penBottom);

      if (minX < minY) {
        this.ball.vx = -this.ball.vx;
      } else {
        this.ball.vy = -this.ball.vy;
      }

      this.destroyBrick(i);
      return;
    }
  }

  /**
   * Marks a brick destroyed, hides it, credits the score (top rows are worth
   * more) and triggers the next level if the board is cleared.
   */
  private destroyBrick(index: number): void {
    const brick = this.bricks[index];
    brick.alive = false;
    this.brickElements[index]?.classList.add('is-broken');
    this.addScore((this.brickRows - brick.row) * 10);

    if (this.bricks.every((b) => !b.alive)) {
      this.nextLevel();
    }
  }

  /**
   * Moves to the next level: regenerates the bricks, speeds up the ball and
   * relaunches it from the paddle.
   */
  private nextLevel(): void {
    this.level++;
    this.speed *= SPEED_PER_LEVEL;
    this.buildBricks();
    this.resetBall();
  }

  /**
   * Loses a life: ends the game if none are left, otherwise recenters the paddle
   * and relaunches the ball.
   */
  private loseLife(): void {
    this.lives--;
    this.updateScoreDisplay();

    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.paddleX = BOARD / 2;
    this.resetBall();
  }

  /**
   * Places the ball above the paddle and launches it upward with a slight random
   * angle, at the current speed.
   */
  private resetBall(): void {
    const angle = (Math.random() * 2 - 1) * (MAX_BOUNCE_ANGLE / 2);
    this.ball = {
      x: this.paddleX,
      y: PADDLE_Y - BALL_R - 1,
      vx: this.speed * Math.sin(angle),
      vy: -this.speed * Math.cos(angle),
    };
  }

  /**
   * Builds the board's persistent structure (brick layer, paddle, ball) only
   * once, then fills the bricks.
   */
  private buildBoard(): void {
    if (!this.boardElement) return;

    this.boardElement.innerHTML = `
      <div class="brick-layer"></div>
      <div class="paddle"></div>
      <div class="ball"></div>`;

    this.brickLayer = this.boardElement.querySelector('.brick-layer');
    this.paddleElement = this.boardElement.querySelector('.paddle');
    this.ballElement = this.boardElement.querySelector('.ball');

    if (this.paddleElement) {
      this.paddleElement.style.width = `${PADDLE_W}%`;
      this.paddleElement.style.height = `${PADDLE_H}%`;
      this.paddleElement.style.top = `${PADDLE_Y}%`;
    }
    if (this.ballElement) {
      this.ballElement.style.width = `${BALL_R * 2}%`;
      this.ballElement.style.height = `${BALL_R * 2}%`;
    }

    this.buildBricks();
  }

  /**
   * (Re)creates the model and the DOM elements of the bricks, laid out in a grid
   * centered at the top of the board.
   */
  private buildBricks(): void {
    const usableWidth = BOARD - 2 * SIDE_MARGIN - (this.brickCols - 1) * BRICK_GAP;
    const brickW = usableWidth / this.brickCols;

    this.bricks = [];
    for (let row = 0; row < this.brickRows; row++) {
      for (let col = 0; col < this.brickCols; col++) {
        this.bricks.push({
          x: SIDE_MARGIN + col * (brickW + BRICK_GAP),
          y: TOP_MARGIN + row * (BRICK_H + BRICK_GAP),
          w: brickW,
          h: BRICK_H,
          alive: true,
          row,
        });
      }
    }

    if (this.brickLayer) {
      this.brickLayer.innerHTML = this.bricks
        .map(
          (brick) =>
            `<div class="brick brick--${brick.row + 1}" style="left:${brick.x}%;top:${brick.y}%;width:${brick.w}%;height:${brick.h}%"></div>`
        )
        .join('');
      this.brickElements = Array.from(this.brickLayer.querySelectorAll<HTMLElement>('.brick'));
    }
  }

  /**
   * Positions ball and paddle according to their logical state (the bricks are
   * updated when destroyed, not every frame).
   */
  render(): void {
    if (this.ballElement) {
      this.ballElement.style.left = `${this.ball.x - BALL_R}%`;
      this.ballElement.style.top = `${this.ball.y - BALL_R}%`;
    }
    if (this.paddleElement) {
      this.paddleElement.style.left = `${this.paddleX - PADDLE_W / 2}%`;
    }
  }

  /**
   * Resets bricks, ball, paddle, lives, level, speed and state, then performs
   * the render.
   */
  reset(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.lives = this.maxLives;
    this.level = 1;
    this.speed = BASE_SPEED;
    this.paddleX = BOARD / 2;
    this.buildBricks();
    this.resetBall();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Shows score, remaining lives and high score in the game header.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `Score: ${this.state.score}`;
    }
    if (this.livesElement) {
      this.livesElement.textContent = `Vies: ${this.lives}`;
    }
    if (this.highScoreElement) {
      this.highScoreElement.textContent = `Meilleur: ${this.scoreManager.getHighScore()}`;
    }
  }

  /**
   * Details shown in the game-over modal: score and level reached.
   */
  protected getGameOverContent(): string {
    return `<div>Score : ${this.state.score}</div><div>Niveau : ${this.level}</div>`;
  }
}
