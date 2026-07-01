import { ScoreManager, ScoreEntry } from '../score/ScoreManager.js';
import { GameOverlay } from '../ui/gameOverlay.js';
import { showStartOverlay, dismissStartOverlay } from '../ui/startOverlay.js';
import { getPlayerName, setPlayerName } from '../net/playerName.js';
import { submitLeaderboardScore, listLeaderboardScores } from '../net/nakama.js';
import {
  LevelsConfig,
  LevelProgress,
  isLevelUnlocked,
  loadLocalProgress,
  loadProgress,
  saveProgress,
} from '../levels/levels.js';
import { setupLevelPanel, LevelPanelHandle } from '../levels/levelPanel.js';
import { setupLeaderboardPanel, LeaderboardPanelHandle } from '../score/leaderboardPanel.js';
import { HudHandle } from '../ui/hud.js';

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
  /**
   * id of the online Nakama leaderboard for this game (e.g. 'snake'). When set,
   * scores are also submitted to and displayed from the backend; when omitted,
   * the game stays local-only (localStorage). Backend calls are best-effort.
   */
  leaderboardId?: string;
  /**
   * Level / unlocking configuration. When set (and the game calls
   * {@link GameEngine.setupLevels} from `initialize`), the engine drives the
   * "Levels" panel, level selection and progress persistence; the game only
   * maps the selected level to its parameters via {@link GameEngine.onLevelSelected}.
   */
  levels?: LevelsConfig;
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
 * {@link GameOverlay} (game-over overlay), and carries the whole game-over flow
 * (the optional save prompt, the Play again/Leaderboard overlay, score table).
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
  /** Game-over overlay (replaces the old modal). */
  protected overlay: GameOverlay;
  /** Handle to the "Leaderboard" panel, when the game opts into one. */
  private leaderboardPanel: LeaderboardPanelHandle | null = null;
  /** Whether the leaderboard panel has been wired (lazy, once). */
  private leaderboardPanelReady = false;

  /** Currently selected level (1 when the game has no levels). */
  protected currentLevel: number = 1;
  /** Player progress for the level system (null until {@link setupLevels}). */
  private levelProgress: LevelProgress | null = null;
  /** Handle to refresh the level panel after progress changes. */
  private levelPanel: LevelPanelHandle | null = null;

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
    this.overlay = new GameOverlay();
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
    // Clear the Play screen if the loop is starting through any path.
    dismissStartOverlay();

    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.lastTime = performance.now();

    this.gameLoop();
  }

  /**
   * Shows the modular Play screen and starts the loop only when the player clicks
   * it. Called by `bootstrapGame` instead of an immediate auto-start, so no game
   * begins before the player decides. Games with their own event-based start
   * (`autoStart: false`, e.g. Typing) bypass this; override for a custom start.
   */
  presentStartScreen(): void {
    showStartOverlay(() => this.start());
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
    // Release the pointer (cursor-driven games grab it for immersive play), so
    // the game-over overlay buttons are clickable again.
    document.exitPointerLock?.();
    this.updateLevelProgress();
    this.onGameOver();
  }

  /**
   * Sets up the level system: loads progress (locally for an instant read, then
   * merged with Nakama Storage), selects the saved level, builds the "Niveaux"
   * panel and applies the level's parameters. Games with a `levels` config call
   * this once from `initialize()`. No-op when no levels are configured.
   */
  protected setupLevels(): void {
    const config = this.config.levels;
    if (!config) return;

    // Instant local read so the panel works offline; seed the best score from
    // the local leaderboard so existing players keep their score-based unlocks.
    this.levelProgress = loadLocalProgress(config.gameKey);
    const topLocal = this.scoreManager.getScores()[0]?.score ?? 0;
    this.levelProgress.bestScore = Math.max(this.levelProgress.bestScore, topLocal);

    this.currentLevel = this.clampSelectedLevel(this.levelProgress.selected);
    this.onLevelSelected(this.currentLevel);

    this.levelPanel = setupLevelPanel({
      config,
      progress: this.levelProgress,
      selected: this.currentLevel,
      onSelect: (id) => this.selectLevel(id),
    });

    // Cross-device progress (best-effort): merge, then refresh the lock states.
    loadProgress(config.gameKey).then((remote) => {
      remote.bestScore = Math.max(remote.bestScore, topLocal);
      this.levelProgress = remote;
      this.levelPanel?.refresh(remote);
    });
  }

  /**
   * Applies a player-picked level: stores it, persists the choice, lets the game
   * reconfigure ({@link onLevelSelected}), then restarts from a clean state.
   */
  private selectLevel(levelId: number): void {
    const config = this.config.levels;
    if (!config || !this.levelProgress) return;
    this.currentLevel = levelId;
    this.levelProgress.selected = levelId;
    saveProgress(config.gameKey, this.levelProgress);
    this.onLevelSelected(levelId);
    this.reset();
    this.start();
  }

  /** Clamps a saved level to one that is actually unlocked (else level 1). */
  private clampSelectedLevel(levelId: number): number {
    const config = this.config.levels;
    if (!config || !this.levelProgress) return 1;
    const level = config.levels.find((l) => l.id === levelId);
    return level && isLevelUnlocked(level, this.levelProgress) ? levelId : 1;
  }

  /**
   * Updates and persists level progress at game over: records the best score and,
   * if the current level was cleared ({@link didWinLevel}), unlocks the next one.
   */
  private updateLevelProgress(): void {
    const config = this.config.levels;
    if (!config || !this.levelProgress) return;
    this.levelProgress.bestScore = Math.max(this.levelProgress.bestScore, this.state.score);
    if (this.didWinLevel()) {
      this.levelProgress.cleared = Math.max(this.levelProgress.cleared, this.currentLevel);
    }
    saveProgress(config.gameKey, this.levelProgress);
    this.levelPanel?.refresh(this.levelProgress);
  }

  /**
   * Maps the selected level to the game's parameters (speed, difficulty…).
   * Hook for level-based games to override; must not start the loop.
   */
  protected onLevelSelected(_levelId: number): void {
    // Hook for subclasses with a `levels` config.
  }

  /**
   * Whether the current level counts as cleared (so the next unlocks). Default
   * `false`; games with a win condition override it (e.g. Pac-Man returns its
   * "all pellets eaten" win).
   */
  protected didWinLevel(): boolean {
    return false;
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
   * The live-stats bar (`.game-details`). A game builds it once in `initialize()`
   * with {@link setupHud} (`this.hud = setupHud([...])`), declaring its readouts
   * (`score`, `high`, `time`, `lives`…); the engine and the game then update
   * values by key. Null for games that don't show any stat.
   */
  protected hud: HudHandle | null = null;

  /**
   * Updates the score readouts on the {@link hud}. The default sets the `score`
   * and (when declared) `high` stats — the common case. Games with extra stats
   * call `super.updateScoreDisplay()` then set theirs (Tetris `lines`, Breakout
   * `lives`); games with different stats (Pong/Memory's two scores) override it.
   */
  protected updateScoreDisplay(): void {
    this.hud?.set('score', this.state.score);
    this.hud?.set('high', this.scoreManager.getHighScore());
  }

  /**
   * Resets the shared run state (score, game-over and pause flags) to a fresh
   * game. Call from a subclass `reset()` before re-seeding its own state, so
   * the three flags aren't recopied in every game.
   */
  protected resetState(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
  }

  /**
   * Entry point of the game-over flow; shows the game-over overlay (with a save
   * prompt for leaderboard games) by default. Override to add side effects (e.g.
   * disabling an input).
   */
  protected onGameOver(): void {
    this.showGameOverOverlay();
  }

  /**
   * Shows the game-over overlay: title, score/details, and — when the game has a
   * leaderboard and the score makes the top-N board — a save prompt (pseudo
   * pre-filled and editable). The engine never auto-saves: the player always
   * decides whether to record the score (and under which name). Always shows
   * "Play again" (+ "View leaderboard" when the game has a leaderboard panel).
   */
  protected showGameOverOverlay(): void {
    // Offer the save prompt only when the game actually shows a leaderboard (e.g.
    // not Pac-Man, which is level-based) and the score makes the top-N board.
    const savable =
      this.leaderboardPanel !== null && this.scoreManager.isHighScore(this.state.score);

    const content = this.getGameOverContent();
    const buttons = [
      {
        text: 'Play again',
        primary: true,
        onClick: () => {
          this.overlay.hide();
          this.restartAfterGameOver();
        },
      },
    ];
    if (this.leaderboardPanel) {
      buttons.push({
        text: 'View leaderboard',
        primary: false,
        onClick: () => {
          this.overlay.hide();
          this.leaderboardPanel?.open();
        },
      });
    }

    this.overlay.show({
      title: this.getGameOverTitle(),
      bodyHtml: content,
      score: content === undefined ? this.state.score : undefined,
      prompt: savable
        ? {
            label: 'Save your score to the leaderboard',
            placeholder: 'Nickname',
            value: getPlayerName() ?? '',
            submitLabel: 'Save',
            onSubmit: (value) => {
              setPlayerName(value);
              this.saveScore(value);
            },
          }
        : undefined,
      buttons,
    });
  }

  /** Saves a score entry locally and (best-effort) online, then refreshes. */
  private saveScore(username: string): void {
    const entry = this.buildScoreEntry(username);
    this.scoreManager.saveScore(entry);
    this.submitOnlineScore(entry);
    this.onScoreSaved();
  }

  /**
   * Best-effort submission of the score to the online leaderboard (only if the
   * game declares a `leaderboardId`). Failures are swallowed so a backend issue
   * never blocks the local save or the restart flow. Refreshes the table once
   * the write lands, so the new global score appears.
   */
  private submitOnlineScore(entry: ScoreEntry): void {
    const leaderboardId = this.config.leaderboardId;
    if (!leaderboardId) return;
    submitLeaderboardScore(leaderboardId, entry)
      .then(() => this.renderScoreTable())
      .catch((err) => console.warn('[nakama] online score submission failed:', err));
  }

  /**
   * Title of the game-over overlay. Override to customize it (e.g. "You won!").
   */
  protected getGameOverTitle(): string {
    return 'Game Over!';
  }

  /**
   * Rich HTML injected into the overlay body. Return `undefined` (default) to
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
    // Wire the "Leaderboard" panel on first render (no-op for games without one).
    if (!this.leaderboardPanelReady) {
      this.leaderboardPanelReady = true;
      this.leaderboardPanel = setupLeaderboardPanel();
    }

    // Immediate paint from the local leaderboard (also the offline fallback).
    this.renderScoreRows(this.scoreManager.getScores());

    // If the game has an online leaderboard, replace it with the global scores.
    const leaderboardId = this.config.leaderboardId;
    if (!leaderboardId) return;
    listLeaderboardScores(leaderboardId, this.config.maxScores ?? 10)
      .then((scores) => this.renderScoreRows(scores))
      .catch((err) => console.warn('[nakama] online leaderboard unavailable:', err));
  }

  /** Fills `#scoreTable tbody` with the given entries (one `<tr>` each). */
  private renderScoreRows(entries: ScoreEntry[]): void {
    if (!this.scoreTableBody) {
      this.scoreTableBody = document.querySelector('#scoreTable tbody');
    }
    if (!this.scoreTableBody) return;

    this.scoreTableBody.innerHTML = entries
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
