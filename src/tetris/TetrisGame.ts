import { GameEngine, GameConfig } from '../shared/engine/GameEngine.js';
import { setupHud } from '../shared/ui/hud.js';
import { keyboardDirection, setupSwipe } from '../shared/engine/input.js';

/**
 * Configuration specific to the Tetris game.
 */
interface TetrisConfig extends GameConfig {
  /** Number of board columns (default: 10). */
  cols?: number;
  /** Number of board rows (default: 20). */
  rows?: number;
  /** Initial drop interval, in ms. */
  baseDropInterval?: number;
  /** Minimum drop interval (max speed), in ms. */
  minDropInterval?: number;
}

/** Identifier of a piece, also used as a CSS color key. */
type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/**
 * Definition of a piece: its square matrix (1 = filled cell) and its type.
 */
interface Tetromino {
  type: TetrominoType;
  matrix: number[][];
}

/**
 * Piece currently falling: its matrix (current orientation), its type and the
 * position of its top-left corner in the grid.
 */
interface ActivePiece {
  type: TetrominoType;
  matrix: number[][];
  x: number;
  y: number;
}

/**
 * The seven tetrominoes in their starting orientation.
 */
const TETROMINOES: Tetromino[] = [
  {
    type: 'I',
    matrix: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  {
    type: 'O',
    matrix: [
      [1, 1],
      [1, 1],
    ],
  },
  {
    type: 'T',
    matrix: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    type: 'S',
    matrix: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    type: 'Z',
    matrix: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    type: 'J',
    matrix: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  {
    type: 'L',
    matrix: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
];

/**
 * Points awarded based on the number of lines cleared at once (index = lines),
 * multiplied by the current level.
 */
const LINE_SCORES = [0, 40, 100, 300, 1200];

/** Horizontal offsets tried during a rotation (basic "wall kicks"). */
const ROTATION_KICKS = [0, -1, 1, -2, 2];

/**
 * Tetris game.
 *
 * Pieces fall at a regular rate into a grid; the player moves and rotates them
 * to complete lines, which clear and earn points. The drop speed increases with
 * the level (every 10 lines). The game ends when a new piece can no longer
 * appear.
 *
 * The game reuses the engine's `requestAnimationFrame` loop: the fall is paced
 * by a time accumulator (like Snake), independently of the render's 60 fps.
 */
export class TetrisGame extends GameEngine {
  private readonly cols: number;
  private readonly rows: number;

  /** Grid of frozen cells; `null` = empty, otherwise the type of the placed piece. */
  private grid: (TetrominoType | null)[][] = [];
  private current: ActivePiece | null = null;

  /** Drop rate (ms). */
  private readonly baseDropInterval: number;
  private readonly minDropInterval: number;
  private dropInterval: number;
  /** Time accumulated since the last descent (ms). */
  private dropAccumulator: number = 0;

  private lines: number = 0;
  private level: number = 1;

  private boardElement: HTMLElement | null = null;

  /**
   * @param config Game configuration (dimensions, drop rate).
   */
  constructor(config: TetrisConfig = {}) {
    super({ ...config, storageKey: 'tetris-high-scores', leaderboardId: 'tetris' });
    this.cols = config.cols || 10;
    this.rows = config.rows || 20;
    this.baseDropInterval = config.baseDropInterval || 800;
    this.minDropInterval = config.minDropInterval || 120;
    this.dropInterval = this.baseDropInterval;
  }

  /**
   * Binds the DOM elements, wires up the keyboard, prepares an empty grid with a
   * first piece, then performs the first render.
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.hud = setupHud([
      { key: 'score', icon: 'star', label: 'Score' },
      { key: 'lines', icon: 'grip-lines', label: 'Lines' },
      { key: 'high', icon: 'trophy', label: 'Best' },
    ]);

    this.setupEventListeners();

    // Touch control (mobile): swiping ←/→ moves, ↓ speeds up the descent,
    // ↑ or tap rotates the piece.
    if (this.boardElement) {
      setupSwipe(this.boardElement, {
        onSwipe: (direction) => {
          if (this.state.isGameOver || !this.current) return;
          if (direction === 'left') this.moveHorizontal(-1);
          else if (direction === 'right') this.moveHorizontal(1);
          else if (direction === 'down') this.softDrop();
          else if (direction === 'up') this.rotate();
        },
        onTap: () => {
          if (this.state.isGameOver || !this.current) return;
          this.rotate();
        },
      });
    }

    this.resetBoard();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Drops the piece by one cell at the `dropInterval` rate (not every frame).
   * When it can no longer descend, the piece is frozen.
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;

    this.dropAccumulator += deltaTime;
    if (this.dropAccumulator < this.dropInterval) return;
    this.dropAccumulator = 0;

    this.step();
  }

  /**
   * Drops the current piece by one cell, or freezes it if it has reached the
   * bottom or another piece.
   */
  private step(): void {
    if (!this.current) return;

    if (this.canPlace(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
    } else {
      this.lockPiece();
    }
  }

  /**
   * Rebuilds the board display: frozen cells and current piece merged.
   */
  render(): void {
    if (!this.boardElement) return;

    const cells = this.composeBoard();
    this.boardElement.innerHTML = cells
      .map((row) =>
        row
          .map((type) =>
            type ? `<div class="cell cell--${type}"></div>` : '<div class="cell"></div>'
          )
          .join('')
      )
      .join('');
  }

  /**
   * Builds the grid to display: a copy of the frozen cells onto which the
   * current piece is stamped.
   */
  private composeBoard(): (TetrominoType | null)[][] {
    const cells = this.grid.map((row) => [...row]);

    if (this.current) {
      const { matrix, x, y, type } = this.current;
      matrix.forEach((row, r) => {
        row.forEach((filled, c) => {
          if (!filled) return;
          const gx = x + c;
          const gy = y + r;
          if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
            cells[gy][gx] = type;
          }
        });
      });
    }

    return cells;
  }

  /**
   * Translates the key into an action: lateral move (left/right), soft drop
   * (down), rotation (up) or hard drop (space).
   */
  handleInput(event: KeyboardEvent): void {
    if (this.state.isGameOver || !this.current) return;

    const direction = keyboardDirection(event);

    if (direction === 'left') {
      event.preventDefault();
      this.moveHorizontal(-1);
    } else if (direction === 'right') {
      event.preventDefault();
      this.moveHorizontal(1);
    } else if (direction === 'down') {
      event.preventDefault();
      this.softDrop();
    } else if (direction === 'up') {
      event.preventDefault();
      this.rotate();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.hardDrop();
    }
  }

  /**
   * Shifts the piece by one column if the target position is free.
   */
  private moveHorizontal(dx: number): void {
    if (!this.current) return;
    if (this.canPlace(this.current.matrix, this.current.x + dx, this.current.y)) {
      this.current.x += dx;
    }
  }

  /**
   * Soft drop: advances the piece by one cell, credits one point and rearms the
   * drop counter to avoid an immediate lock.
   */
  private softDrop(): void {
    if (!this.current) return;
    if (this.canPlace(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
      this.dropAccumulator = 0;
      this.addScore(1);
    }
  }

  /**
   * Hard drop: drops the piece down to contact, credits the distance traveled,
   * then freezes it.
   */
  private hardDrop(): void {
    if (!this.current) return;

    let distance = 0;
    while (this.canPlace(this.current.matrix, this.current.x, this.current.y + 1)) {
      this.current.y++;
      distance++;
    }
    if (distance > 0) this.addScore(distance);

    this.dropAccumulator = 0;
    this.lockPiece();
  }

  /**
   * Rotates the piece clockwise, trying a few lateral offsets
   * ({@link ROTATION_KICKS}) if the target orientation hits a wall or a piece.
   */
  private rotate(): void {
    if (!this.current) return;

    const rotated = this.rotateMatrix(this.current.matrix);
    for (const offset of ROTATION_KICKS) {
      if (this.canPlace(rotated, this.current.x + offset, this.current.y)) {
        this.current.matrix = rotated;
        this.current.x += offset;
        return;
      }
    }
  }

  /**
   * Returns a copy of the matrix rotated 90° clockwise.
   */
  private rotateMatrix(matrix: number[][]): number[][] {
    const n = matrix.length;
    const rotated = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        rotated[j][n - 1 - i] = matrix[i][j];
      }
    }
    return rotated;
  }

  /**
   * Tells whether a matrix can occupy the given position: each filled cell must
   * stay within the columns/the bottom of the grid and not overlap a frozen
   * cell (overflow through the top is tolerated for spawning).
   */
  private canPlace(matrix: number[][], posX: number, posY: number): boolean {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const gx = posX + c;
        const gy = posY + r;
        if (gx < 0 || gx >= this.cols || gy >= this.rows) return false;
        if (gy >= 0 && this.grid[gy][gx]) return false;
      }
    }
    return true;
  }

  /**
   * Freezes the current piece into the grid, clears the complete lines then
   * spawns the next piece.
   */
  private lockPiece(): void {
    if (!this.current) return;

    const { matrix, x, y, type } = this.current;
    matrix.forEach((row, r) => {
      row.forEach((filled, c) => {
        if (!filled) return;
        const gy = y + r;
        const gx = x + c;
        if (gy >= 0 && gy < this.rows && gx >= 0 && gx < this.cols) {
          this.grid[gy][gx] = type;
        }
      });
    });

    const cleared = this.clearLines();
    if (cleared > 0) {
      this.lines += cleared;
      this.addScore(LINE_SCORES[cleared] * this.level);
      this.updateLevel();
    }

    this.spawnPiece();
  }

  /**
   * Clears all full lines and drops down the ones above.
   * @returns The number of lines cleared.
   */
  private clearLines(): number {
    let cleared = 0;
    let y = this.rows - 1;

    while (y >= 0) {
      if (this.grid[y].every((cell) => cell !== null)) {
        this.grid.splice(y, 1);
        this.grid.unshift(new Array(this.cols).fill(null));
        cleared++;
      } else {
        y--;
      }
    }

    return cleared;
  }

  /**
   * Recomputes the level (one tier every 10 lines) and speeds up the fall
   * accordingly, without going below `minDropInterval`.
   */
  private updateLevel(): void {
    this.level = Math.floor(this.lines / 10) + 1;
    this.dropInterval = Math.max(
      this.minDropInterval,
      this.baseDropInterval - (this.level - 1) * 65
    );
  }

  /**
   * Spawns a new random piece, centered at the top. If it cannot be placed, the
   * game is over.
   */
  private spawnPiece(): void {
    const template = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
    const matrix = template.matrix.map((row) => [...row]);
    const x = Math.floor((this.cols - matrix[0].length) / 2);
    const y = 0;

    this.current = { type: template.type, matrix, x, y };

    if (!this.canPlace(matrix, x, y)) {
      this.gameOver();
    }
  }

  /**
   * Creates an empty grid and spawns the first piece.
   */
  private resetBoard(): void {
    this.grid = Array.from({ length: this.rows }, () =>
      new Array<TetrominoType | null>(this.cols).fill(null)
    );
    this.spawnPiece();
  }

  /**
   * Resets grid, score, lines, level, rate and state, then performs the render.
   */
  reset(): void {
    this.resetState();
    this.lines = 0;
    this.level = 1;
    this.dropInterval = this.baseDropInterval;
    this.dropAccumulator = 0;
    this.resetBoard();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Details shown in the game-over modal: score and lines cleared.
   */
  protected getGameOverContent(): string {
    return `<div>Score: ${this.state.score}</div><div>Lines: ${this.lines}</div>`;
  }

  /**
   * Shows score, lines and high score in the game header.
   */
  protected updateScoreDisplay(): void {
    super.updateScoreDisplay();
    this.hud?.set('lines', this.lines);
  }
}
