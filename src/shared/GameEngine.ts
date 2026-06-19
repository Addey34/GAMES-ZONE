import { ScoreManager, ScoreEntry } from './ScoreManager.js';
import { ModalManager } from './ModalManager.js';

/**
 * Configuration shared by all games, passed to the engine constructor.
 */
export interface GameConfig {
  /** Logical canvas width (px). */
  canvasWidth?: number;
  /** Logical canvas height (px). */
  canvasHeight?: number;
  /** Initial loop rate (ms). */
  initialSpeed?: number;
  /** localStorage key for this game's leaderboard. */
  storageKey?: string;
  /** Number of entries kept in the leaderboard. */
  maxScores?: number;
  /** id of the modal element in the HTML (default: 'scoreModal'). */
  modalId?: string;
}

/**
 * Runtime state shared by all games.
 */
export interface GameState {
  /** Current score of the game. */
  score: number;
  /** The game loop is running. */
  isRunning: boolean;
  /** The game is over. */
  isGameOver: boolean;
  /** The game is paused. */
  isPaused: boolean;
}

/**
 * Abstract base class of all games.
 *
 * `GameEngine` owns the `requestAnimationFrame` loop, the lifecycle
 * (`start`/`stop`/`pause`/`gameOver`) and the shared state ({@link GameState}). It
 * also composes the collaborators {@link ScoreManager} (leaderboard) and
 * {@link ModalManager} (game-over modal), and carries the whole game-over flow
 * (Save/Restart modal, score saving, score table).
 *
 * A subclass must implement {@link initialize}, {@link update},
 * {@link render}, {@link handleInput} and {@link reset}, and only overrides the
 * small `protected` hooks (`getGameOverTitle`, `getGameOverContent`,
 * `buildScoreEntry`, `scoreTableRow`, `updateScoreDisplay`…) where its
 * behavior differs.
 *
 * Lifecycle contract: `initialize()` runs **only once**
 * (DOM binding, listeners, first render); `start()` only (re)starts the
 * loop without re-initializing. A restart is therefore `reset()` + `start()`,
 * never a second `initialize()` (otherwise listeners stack up).
 */
export abstract class GameEngine {
  protected config: GameConfig;
  protected state: GameState;
  protected animationFrameId: number | null = null;
  protected lastTime: number = 0;

  /**
   * Cap on the `deltaTime` passed to `update()` (ms). When the tab goes to the
   * background, `requestAnimationFrame` is frozen: on resume, the first frame
   * would report a delta of several seconds, making any simulation "jump"
   * (ball going through a wall, etc.). We therefore clamp the delta so the
   * resume starts from a reasonable step. Games can still reduce it further.
   */
  protected static readonly MAX_FRAME_DELTA = 100;

  /** Persisted leaderboard of the game. */
  protected scoreManager: ScoreManager;
  /** Game-over modal. */
  protected modalManager: ModalManager;

  /**
   * @param config Game configuration (default values applied).
   */
  constructor(config: GameConfig = {}) {
    this.config = {
      canvasWidth: 800,
      canvasHeight: 600,
      initialSpeed: 1000,
      ...config,
    };
    this.state = {
      score: 0,
      isRunning: false,
      isGameOver: false,
      isPaused: false,
    };

    this.scoreManager = new ScoreManager(
      this.config.storageKey ?? 'scores',
      this.config.maxScores ?? 10
    );
    this.modalManager = new ModalManager(this.config.modalId ?? 'scoreModal');
  }

  /** DOM binding, listeners and first render. Runs only once. */
  abstract initialize(): void;
  /**
   * Updates the game logic.
   * @param deltaTime Time elapsed since the previous frame (ms).
   */
  abstract update(deltaTime: number): void;
  /** Draws the current state into the DOM. */
  abstract render(): void;
  /** Handles a keyboard input. */
  abstract handleInput(event: KeyboardEvent): void;
  /** Resets the game to its initial state (without restarting the loop). */
  abstract reset(): void;

  /**
   * Wires up the default keyboard input (`keydown` → {@link handleInput}). To
   * be called from `initialize()`. Games listening to something other than the
   * keyboard (e.g. text typing) override this method.
   */
  protected setupEventListeners(): void {
    document.addEventListener('keydown', (e) => {
      if (this.isFormFieldTarget(e.target)) return;
      this.handleInput(e);
    });
  }

  /**
   * Tells whether the event targets a form field (input/textarea/editable area),
   * in which case the game must not intercept the keystroke — otherwise the
   * control keys (arrows, letters) are stolen from the leaderboard name field.
   */
  protected isFormFieldTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return (
      element instanceof HTMLElement &&
      (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable)
    );
  }

  /**
   * Starts the game loop. No-op if it is already running. Does not re-run
   * `initialize()`: a restart goes through `reset()` then `start()`.
   */
  start(): void {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.lastTime = performance.now();

    this.gameLoop();
  }

  /**
   * Stops the game loop and cancels the scheduled frame.
   */
  stop(): void {
    this.state.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Toggles the pause state. On resume, restarts the loop (which stops
   * rescheduling itself as soon as pause is entered).
   */
  pause(): void {
    if (!this.state.isRunning) return;
    this.state.isPaused = !this.state.isPaused;

    if (!this.state.isPaused) {
      this.lastTime = performance.now();
      this.gameLoop();
    }
  }

  /**
   * Ends the game: stops the loop and triggers the game-over flow
   * ({@link onGameOver}).
   */
  gameOver(): void {
    this.state.isGameOver = true;
    this.state.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.onGameOver();
  }

  /**
   * Main loop: computes the `deltaTime`, updates then renders the game, and
   * reschedules itself via `requestAnimationFrame` as long as the game runs.
   */
  protected gameLoop(): void {
    if (!this.state.isRunning || this.state.isPaused) return;

    const currentTime = performance.now();
    const deltaTime = Math.min(currentTime - this.lastTime, GameEngine.MAX_FRAME_DELTA);
    this.lastTime = currentTime;

    this.update(deltaTime);
    this.render();

    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }

  /**
   * Adds points to the score and triggers the display update.
   */
  protected addScore(points: number): void {
    this.state.score += points;
    this.onScoreChange(this.state.score);
  }

  /**
   * Hook called on every score change; refreshes the display by default.
   */
  protected onScoreChange(_newScore: number): void {
    this.updateScoreDisplay();
  }

  /**
   * Writes the score into the game's DOM. Hook to override: selectors and format
   * vary from one game to another.
   */
  protected updateScoreDisplay(): void {
    // Hook for subclasses.
  }

  /**
   * Entry point of the game-over flow; shows the modal by default.
   * Override to add side effects (e.g. disabling an input).
   */
  protected onGameOver(): void {
    this.showGameOverModal();
  }

  /**
   * Builds and shows the game-over modal (title, details, name field if the
   * score makes the leaderboard, Save/Restart buttons).
   */
  protected showGameOverModal(): void {
    const content = this.getGameOverContent();
    this.modalManager.show({
      title: this.getGameOverTitle(),
      content,
      showScore: content === undefined,
      score: this.state.score,
      showUsernameInput: this.scoreManager.isHighScore(this.state.score),
      buttons: [
        {
          text: 'Sauvegarder',
          primary: true,
          onClick: () => this.handleSaveScore(),
        },
        {
          text: 'Recommencer',
          primary: false,
          onClick: () => {
            this.modalManager.hide();
            this.restartAfterGameOver();
          },
        },
      ],
    });
  }

  /**
   * Saves the score if a name is entered and the score makes the leaderboard,
   * then closes the modal and restarts a game.
   */
  private handleSaveScore(): void {
    const username = this.modalManager.getUsername();
    if (username && this.scoreManager.isHighScore(this.state.score)) {
      this.scoreManager.saveScore(this.buildScoreEntry(username));
      this.onScoreSaved();
    }
    this.modalManager.hide();
    this.restartAfterGameOver();
  }

  /**
   * Title of the game-over modal. Override to customize it (e.g. "You won!").
   */
  protected getGameOverTitle(): string {
    return 'Game Over !';
  }

  /**
   * Rich HTML injected into `.score-details`. Return `undefined` (default) to
   * show a plain "Score: N".
   */
  protected getGameOverContent(): string | undefined {
    return undefined;
  }

  /**
   * Builds the entry written to the leaderboard. Override to add game-specific
   * data (e.g. typing speed).
   */
  protected buildScoreEntry(username: string): ScoreEntry {
    return { username, score: this.state.score, date: new Date() };
  }

  /**
   * Hook called after a successful save; refreshes the displayed leaderboard.
   */
  protected onScoreSaved(): void {
    this.renderScoreTable();
  }

  /** Body of the score table (`#scoreTable tbody`), resolved lazily. */
  protected scoreTableBody: HTMLElement | null = null;

  /**
   * Renders the leaderboard into `#scoreTable`. To be called from `initialize()`
   * for the initial display; re-rendered automatically after each save.
   */
  protected renderScoreTable(): void {
    if (!this.scoreTableBody) {
      this.scoreTableBody = document.querySelector('#scoreTable tbody');
    }
    if (!this.scoreTableBody) return;

    this.scoreTableBody.innerHTML = this.scoreManager
      .getScores()
      .map((entry) => `<tr>${this.scoreTableRow(entry)}</tr>`)
      .join('');
  }

  /**
   * Returns the `<td>` cells of one leaderboard row. Override to add columns
   * (default: name + score).
   */
  protected scoreTableRow(entry: ScoreEntry): string {
    return `<td>${this.escapeHtml(entry.username)}</td><td>${entry.score}</td>`;
  }

  /**
   * Escapes a user-entered value before HTML injection (anti-XSS).
   */
  protected escapeHtml(value: string): string {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  /**
   * Behavior triggered by "Restart". Default: `reset()` + `start()`.
   * Override for a different restart (e.g. restart on the first keystroke).
   */
  protected restartAfterGameOver(): void {
    this.reset();
    this.start();
  }

  /**
   * Returns the current state, read-only.
   */
  getState(): Readonly<GameState> {
    return this.state;
  }

  /**
   * Returns the configuration, read-only.
   */
  getConfig(): Readonly<GameConfig> {
    return this.config;
  }
}
