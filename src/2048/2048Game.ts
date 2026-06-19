import { GameEngine, GameConfig } from '../shared/GameEngine.js';
import { Direction, keyboardDirection, setupSwipe } from '../shared/input.js';

/**
 * Configuration specific to the 2048 game.
 */
interface Game2048Config extends GameConfig {
  /** Number of cells per grid side (default: 4). */
  gridSize?: number;
}

/**
 * Result of sliding a row to the left.
 */
interface SlideResult {
  /** Row after compression and merges. */
  row: number[];
  /** Points earned by this row's merges. */
  gained: number;
  /** Whether the row changed compared to the original. */
  changed: boolean;
}

/**
 * 2048 game.
 *
 * On a square grid, the arrows slide all the tiles in one direction; two tiles
 * of the same value that meet merge into their sum (a single merge per tile per
 * move) and credit that sum to the score. After each valid move, a new tile (2
 * at 90%, 4 at 10%) appears on a free cell. The game ends when no move is
 * possible anymore.
 *
 * Like the typing game, this game is event-driven and does not use the engine's
 * `requestAnimationFrame` loop: {@link start} merely activates the state, and the
 * render is triggered after each move.
 */
export class Game2048 extends GameEngine {
  private readonly gridSize: number;
  /** Grid of values; 0 = empty cell, otherwise a power of two. */
  private board: number[][] = [];

  private boardElement: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /**
   * @param config Game configuration (grid size).
   */
  constructor(config: Game2048Config = {}) {
    super({ ...config, storageKey: '2048-high-scores' });
    this.gridSize = config.gridSize || 4;
  }

  /**
   * Binds the DOM elements, wires up the keyboard, initializes the grid with two
   * tiles then performs the first render.
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.highScoreElement = document.querySelector('.high-score');

    this.setupEventListeners();

    // Touch control (mobile): swiping on the grid plays the move.
    if (this.boardElement) {
      setupSwipe(this.boardElement, {
        onSwipe: (direction) => this.applyMove(direction),
      });
    }

    this.resetBoard();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Activates the game state without starting the `requestAnimationFrame` loop:
   * 2048 is driven by keyboard events (see {@link handleInput}).
   */
  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;
  }

  /**
   * No-op: no continuous logic to update (event-driven game). Required by the
   * {@link GameEngine} contract.
   */
  update(_deltaTime: number): void {}

  /**
   * Rebuilds the grid display from {@link board}. Each tile carries a
   * `tile--<value>` class (and a modifier based on its number of digits) for its
   * styling.
   */
  render(): void {
    if (!this.boardElement) return;

    this.boardElement.innerHTML = '';

    this.board.forEach((row) => {
      row.forEach((value) => {
        const tile = document.createElement('div');
        tile.className = this.tileClass(value);
        tile.textContent = value > 0 ? value.toString() : '';
        this.boardElement!.appendChild(tile);
      });
    });
  }

  /**
   * CSS class of a tile based on its value and its number of digits (large
   * numbers shrink the font size).
   */
  private tileClass(value: number): string {
    if (value === 0) return 'tile';

    const digits = value.toString().length;
    const sizeModifier = digits >= 4 ? ' tile--4digits' : digits === 3 ? ' tile--3digits' : '';
    // Beyond 2048, single palette (no dedicated color per value).
    const colorClass = value <= 2048 ? `tile--${value}` : 'tile--super';
    return `tile ${colorClass}${sizeModifier}`;
  }

  /**
   * Applies the move matching the pressed key. If the grid changes, spawns a new
   * tile, updates the display and checks for game over.
   */
  handleInput(event: KeyboardEvent): void {
    const direction = keyboardDirection(event);
    if (!direction) return;

    event.preventDefault();
    this.applyMove(direction);
  }

  /**
   * Plays a move in the given direction (keyboard or swipe). If the grid
   * changes, spawns a tile, refreshes the display and checks for game over.
   */
  private applyMove(direction: Direction): void {
    if (this.state.isGameOver) return;

    if (this.move(direction)) {
      this.spawnTile();
      this.render();
      if (!this.canMove()) {
        this.gameOver();
      }
    }
  }

  /**
   * Slides and merges all the tiles in the given direction, crediting the score
   * with the merges.
   *
   * All directions reduce to a leftward slide via rotation/reflection of the
   * grid, followed by the inverse transformation.
   *
   * @returns `true` if the grid changed (valid move).
   */
  private move(direction: Direction): boolean {
    const rotated = this.toLeftOriented(this.board, direction);

    let changed = false;
    let gained = 0;
    const slid = rotated.map((row) => {
      const result = this.slideRow(row);
      if (result.changed) changed = true;
      gained += result.gained;
      return result.row;
    });

    if (changed) {
      this.board = this.fromLeftOriented(slid, direction);
      this.addScore(gained);
    }

    return changed;
  }

  /**
   * Orients the grid so that a "leftward" slide corresponds to the requested
   * direction.
   */
  private toLeftOriented(board: number[][], direction: Direction): number[][] {
    switch (direction) {
      case 'left':
        return board.map((row) => [...row]);
      case 'right':
        return this.reverseRows(board);
      case 'up':
        return this.transpose(board);
      case 'down':
        return this.reverseRows(this.transpose(board));
    }
  }

  /**
   * Inverse transformation of {@link toLeftOriented}: brings the slid grid back
   * to its original orientation.
   */
  private fromLeftOriented(board: number[][], direction: Direction): number[][] {
    switch (direction) {
      case 'left':
        return board;
      case 'right':
        return this.reverseRows(board);
      case 'up':
        return this.transpose(board);
      case 'down':
        return this.transpose(this.reverseRows(board));
    }
  }

  /**
   * Compresses a row to the left then merges equal adjacent tiles (one merge per
   * tile), and pads on the right with empty cells.
   */
  private slideRow(row: number[]): SlideResult {
    const nonZero = row.filter((value) => value !== 0);
    const merged: number[] = [];
    let gained = 0;

    for (let i = 0; i < nonZero.length; i++) {
      if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
        const value = nonZero[i] * 2;
        merged.push(value);
        gained += value;
        i++;
      } else {
        merged.push(nonZero[i]);
      }
    }

    while (merged.length < row.length) merged.push(0);

    const changed = merged.some((value, index) => value !== row[index]);
    return { row: merged, gained, changed };
  }

  /**
   * Transposes the grid (swaps rows and columns).
   */
  private transpose(board: number[][]): number[][] {
    return board[0].map((_, col) => board.map((row) => row[col]));
  }

  /**
   * Returns a copy of the grid with each row reversed.
   */
  private reverseRows(board: number[][]): number[][] {
    return board.map((row) => [...row].reverse());
  }

  /**
   * Spawns a tile (2 at 90%, 4 at 10%) on a randomly chosen free cell. No-op if
   * the grid is full.
   */
  private spawnTile(): void {
    const empty: Array<{ x: number; y: number }> = [];
    this.board.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value === 0) empty.push({ x, y });
      });
    });

    if (empty.length === 0) return;

    const cell = empty[Math.floor(Math.random() * empty.length)];
    this.board[cell.y][cell.x] = Math.random() < 0.9 ? 2 : 4;
  }

  /**
   * Tells whether a move is still possible: a free cell, or two equal adjacent
   * tiles (horizontally or vertically).
   */
  private canMove(): boolean {
    for (let y = 0; y < this.gridSize; y++) {
      for (let x = 0; x < this.gridSize; x++) {
        const value = this.board[y][x];
        if (value === 0) return true;
        if (x + 1 < this.gridSize && value === this.board[y][x + 1]) return true;
        if (y + 1 < this.gridSize && value === this.board[y + 1][x]) return true;
      }
    }
    return false;
  }

  /**
   * Creates an empty grid and places the two starting tiles on it.
   */
  private resetBoard(): void {
    this.board = Array.from({ length: this.gridSize }, () =>
      Array.from({ length: this.gridSize }, () => 0)
    );
    this.spawnTile();
    this.spawnTile();
  }

  /**
   * Resets the grid, the score and the state, then performs the render.
   */
  reset(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.resetBoard();
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
      this.highScoreElement.textContent = `Meilleur: ${this.scoreManager.getHighScore()}`;
    }
  }
}
