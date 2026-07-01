import { GameEngine, GameConfig } from '../shared/engine/GameEngine.js';
import {
  Direction,
  Vec2 as Position,
  DIRECTION_DELTAS,
  OPPOSITE_DIRECTION,
  keyboardDirection,
  setupSwipe,
} from '../shared/engine/input.js';
import { setupHud } from '../shared/ui/hud.js';
import { Difficulty } from '../shared/bot/difficulty.js';
import { LevelDef } from '../shared/levels/levels.js';
import { GHOST_PERSONALITIES, chooseGhostDirection } from './ghostAi.js';

/** Number of Pac-Man levels offered in the "Levels" panel. */
const PACMAN_LEVEL_COUNT = 30;

/**
 * Pac-Man's levels: level 1 is open, the rest unlock by clearing the previous
 * one (win = eat every pellet). Each level only differs by its parameters,
 * derived from the number (see {@link PacmanGame.onLevelSelected}).
 */
function buildPacmanLevels(): LevelDef[] {
  const levels: LevelDef[] = [];
  for (let id = 1; id <= PACMAN_LEVEL_COUNT; id++) {
    levels.push({ id, unlock: id === 1 ? { type: 'open' } : { type: 'sequential' } });
  }
  return levels;
}

/**
 * Configuration specific to the Pac-Man game.
 */
interface PacmanConfig extends GameConfig {
  /** Interval between two moves, in ms (smaller = faster). */
  gameSpeed?: number;
  /** Ghost AI difficulty (`easy` = original purely-random ghosts). */
  difficulty?: Difficulty;
}

/**
 * A ghost: its grid position and its current movement direction.
 */
interface Ghost extends Position {
  direction: Direction;
}

/**
 * Pac-Man game.
 *
 * Pac-Man travels across a closed map (off-grid cells count as walls) eating the
 * food; three ghosts chase him via their AI (see `ghostAi.ts`), pursuing harder
 * as the difficulty rises. The game is won when all the food is eaten, lost on
 * contact with a ghost. Nothing moves until the player presses a first key.
 */
export class PacmanGame extends GameEngine {
  /** Pac-Man's starting cell (never counted as food). */
  private static readonly PACMAN_START: Position = { x: 1, y: 1 };

  private wallMap: number[][];
  private totalFood: number;
  private pacman: Position;
  private ghosts: Ghost[];
  /** Direction actually followed by Pac-Man. */
  private currentDirection: Direction | null = null;
  /** Direction requested by the player, applied as soon as a passage opens. */
  private nextDirection: Direction | null = null;
  /** The game only starts on the first key press. */
  private hasStarted: boolean = false;
  /** Remembers whether the last game over is a win (modal title). */
  private pendingWin: boolean = false;
  private mapElement: HTMLElement | null = null;
  private gameSpeed: number;
  private difficulty: Difficulty;
  /** Time accumulated since the last move (ms). */
  private lastMoveTime: number = 0;

  /**
   * @param config Game configuration (movement speed).
   */
  constructor(config: PacmanConfig = {}) {
    // Level-based game: no leaderboard panel (see its `games` entry), so no
    // `leaderboardId` — progress is tracked through the level system instead.
    super({
      ...config,
      storageKey: 'pacman-high-scores',
      levels: { gameKey: 'pacman', levels: buildPacmanLevels() },
    });
    this.gameSpeed = config.gameSpeed || 200;
    this.difficulty = config.difficulty ?? 'medium';

    this.wallMap = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
      [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
      [1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1],
      [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
      [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ];

    // Every free cell carries a pellet, except Pac-Man's starting cell (never
    // crossed, therefore never edible): we exclude it from the total to eat.
    this.totalFood = this.wallMap.flat().filter((c) => c === 0).length - 1;

    this.pacman = { ...PacmanGame.PACMAN_START };
    this.ghosts = this.createGhosts();
  }

  /**
   * Creates the three ghosts at fixed positions (the three walkable corners
   * other than Pac-Man's, top left).
   */
  private createGhosts(): Ghost[] {
    return [
      { x: 19, y: 1, direction: 'down' },
      { x: 1, y: 15, direction: 'up' },
      { x: 19, y: 15, direction: 'up' },
    ];
  }

  /**
   * Binds the DOM elements, builds the map, wires up the keyboard and performs
   * the first render.
   */
  initialize(): void {
    this.mapElement = document.getElementById('map');
    this.hud = setupHud([{ key: 'score', icon: 'star', label: 'Score' }]);

    this.setupEventListeners();
    this.setupLevels();

    // Touch control (mobile): swiping on the map steers Pac-Man.
    if (this.mapElement) {
      setupSwipe(this.mapElement, {
        onSwipe: (direction) => {
          if (this.state.isGameOver) return;
          this.nextDirection = direction;
          this.hasStarted = true;
        },
      });
    }

    this.createMap();
    this.render();
    this.updateScoreDisplay();
  }

  /**
   * Generates the map cells (walls / food) in the DOM. The cell size is handled
   * by the responsive CSS grid, not in fixed pixels.
   */
  private createMap(): void {
    if (!this.mapElement) return;

    this.mapElement.innerHTML = '';

    this.wallMap.forEach((row, y) => {
      row.forEach((cell, x) => {
        const div = document.createElement('div');
        const isStart = x === PacmanGame.PACMAN_START.x && y === PacmanGame.PACMAN_START.y;
        // Wall, empty corridor (starting cell) or corridor with a pellet.
        div.classList.add(cell === 1 ? 'wall' : isStart ? 'nofood' : 'food');
        div.dataset.x = x.toString();
        div.dataset.y = y.toString();
        this.mapElement!.appendChild(div);
      });
    });
  }

  /**
   * Returns the neighboring cell of a position in a given direction.
   */
  private nextCell(pos: Position, dir: Direction): Position {
    const delta = DIRECTION_DELTAS[dir];
    return { x: pos.x + delta.x, y: pos.y + delta.y };
  }

  /**
   * Tells whether a cell is walkable (off-grid = wall ⇒ closed map).
   */
  private isWalkable(pos: Position): boolean {
    return this.wallMap[pos.y]?.[pos.x] === 0;
  }

  /**
   * Tells whether a move from `pos` in direction `dir` is possible.
   */
  private canMove(pos: Position, dir: Direction): boolean {
    return this.isWalkable(this.nextCell(pos, dir));
  }

  /**
   * Moves Pac-Man and the ghosts at the `gameSpeed` rate. Inert until the player
   * has pressed a key.
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;
    if (!this.hasStarted) return;

    this.lastMoveTime += deltaTime;
    if (this.lastMoveTime < this.gameSpeed) return;
    this.lastMoveTime = 0;

    // Remember Pac-Man's cell before he moves so the ghosts can detect a
    // "swap" (Pac-Man and a ghost exchanging cells in the same tick) — without
    // it, two entities crossing each other would slip through uncaught.
    const pacmanPrev = { ...this.pacman };
    this.movePacman();
    this.moveGhosts(pacmanPrev);
  }

  /**
   * Renders Pac-Man and the ghosts.
   */
  render(): void {
    this.renderPacman();
    this.renderGhosts();
  }

  /**
   * Moves Pac-Man by one cell and eats the food encountered.
   *
   * Deferred turn: the requested direction applies as soon as it is free, so
   * pointing toward a wall does not stop Pac-Man, who keeps going straight.
   * Facing a wall, he stays put but keeps his direction and request, and resumes
   * as soon as a passage opens. The win is triggered once all the food is eaten.
   */
  private movePacman(): void {
    if (this.state.isGameOver) return;

    if (this.nextDirection && this.canMove(this.pacman, this.nextDirection)) {
      this.currentDirection = this.nextDirection;
    }

    if (!this.currentDirection) return;

    if (!this.canMove(this.pacman, this.currentDirection)) return;

    this.pacman = this.nextCell(this.pacman, this.currentDirection);

    const cell = document.querySelector(`[data-x="${this.pacman.x}"][data-y="${this.pacman.y}"]`);
    if (cell && cell.classList.contains('food')) {
      cell.classList.remove('food');
      cell.classList.add('nofood');
      this.addScore(1);

      if (this.state.score >= this.totalFood) {
        this.endGame(true);
      }
    }
  }

  /**
   * Moves each ghost, avoiding the U-turn except when it is the only way out
   * (more natural movement). Each ghost's direction is chosen by its AI brain
   * (see `ghostAi.ts`), which pursues Pac-Man according to its personality and
   * the configured difficulty. Contact with Pac-Man ends the game (loss).
   */
  private moveGhosts(pacmanPrev: Position): void {
    const directions: Direction[] = ['up', 'down', 'left', 'right'];
    const pacmanDir = this.currentDirection ?? 'left';

    this.ghosts.forEach((ghost, index) => {
      const ghostPrev = { x: ghost.x, y: ghost.y };

      let valid = directions.filter((dir) => this.canMove(ghost, dir));

      const forward = valid.filter((dir) => dir !== OPPOSITE_DIRECTION[ghost.direction]);
      if (forward.length > 0) valid = forward;

      if (valid.length > 0) {
        ghost.direction = chooseGhostDirection(
          valid,
          { ghost: { x: ghost.x, y: ghost.y }, pacman: this.pacman, pacmanDir },
          GHOST_PERSONALITIES[index % GHOST_PERSONALITIES.length],
          this.difficulty
        );
        const next = this.nextCell(ghost, ghost.direction);
        ghost.x = next.x;
        ghost.y = next.y;
      }

      // Collision when they land on the same cell, OR when they swapped cells
      // (Pac-Man took the ghost's old cell while the ghost took Pac-Man's) —
      // the latter is the "passing through a ghost" case.
      const sameCell = ghost.x === this.pacman.x && ghost.y === this.pacman.y;
      const swapped =
        ghost.x === pacmanPrev.x &&
        ghost.y === pacmanPrev.y &&
        ghostPrev.x === this.pacman.x &&
        ghostPrev.y === this.pacman.y;

      if (sameCell || swapped) {
        this.endGame(false);
      }
    });
  }

  /**
   * Positions `.pacman` on the current cell, with an orientation class
   * (`.pacman--<direction>`) that turns the mouth toward the movement.
   */
  private renderPacman(): void {
    document
      .querySelectorAll('.pacman')
      .forEach((el) =>
        el.classList.remove('pacman', 'pacman--up', 'pacman--down', 'pacman--left', 'pacman--right')
      );
    const pacmanCell = document.querySelector(
      `[data-x="${this.pacman.x}"][data-y="${this.pacman.y}"]`
    );
    if (pacmanCell) {
      pacmanCell.classList.add('pacman', `pacman--${this.currentDirection ?? 'right'}`);
    }
  }

  /**
   * Positions `.ghost` on each ghost's cell, with an index class
   * (`.ghost--0/1/2`) that determines its color.
   */
  private renderGhosts(): void {
    document
      .querySelectorAll('.ghost')
      .forEach((el) => el.classList.remove('ghost', 'ghost--0', 'ghost--1', 'ghost--2'));
    this.ghosts.forEach((ghost, index) => {
      const ghostCell = document.querySelector(`[data-x="${ghost.x}"][data-y="${ghost.y}"]`);
      if (ghostCell) ghostCell.classList.add('ghost', `ghost--${index}`);
    });
  }

  /**
   * No "Jouer" overlay: the loop can run from load because Pac-Man and the
   * ghosts stay still until the first key press (see `hasStarted`), so an
   * unintended start is already blocked. Start the loop directly.
   */
  presentStartScreen(): void {
    this.start();
  }

  /**
   * Remembers the requested direction (deferred turn) and starts the game on the
   * first key press.
   */
  handleInput(event: KeyboardEvent): void {
    if (this.state.isGameOver) return;

    const direction = keyboardDirection(event);
    if (direction) {
      event.preventDefault();
      this.nextDirection = direction;
      this.hasStarted = true;
    }
  }

  /**
   * Resets Pac-Man and the ghosts, resets score, directions and state, then
   * rebuilds the map.
   */
  reset(): void {
    this.pacman = { ...PacmanGame.PACMAN_START };
    this.ghosts = this.createGhosts();
    this.currentDirection = null;
    this.nextDirection = null;
    this.hasStarted = false;
    this.pendingWin = false;
    this.resetState();
    this.lastMoveTime = 0;

    this.createMap();
    this.render();
    this.updateScoreDisplay();
  }

  /**
   * Remembers the outcome (win/loss) then delegates to the shared game-over flow.
   */
  private endGame(isWin: boolean): void {
    this.pendingWin = isWin;
    this.gameOver();
  }

  /**
   * Modal title: "You won!" on a win, otherwise "Game Over!".
   */
  protected getGameOverTitle(): string {
    return this.pendingWin ? 'You won!' : 'Game Over!';
  }

  /**
   * Maps the selected level to a steady ramp: ghosts move faster (smaller
   * interval) and grow smarter (`easy` → `medium` → `hard`) as the level rises.
   */
  protected onLevelSelected(levelId: number): void {
    this.gameSpeed = Math.max(80, 220 - (levelId - 1) * 5);
    this.difficulty = levelId <= 6 ? 'easy' : levelId <= 18 ? 'medium' : 'hard';
  }

  /** A level is cleared when Pac-Man eats every pellet (the game's win). */
  protected didWinLevel(): boolean {
    return this.pendingWin;
  }
}
