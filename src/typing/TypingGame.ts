import { GameEngine, GameConfig } from '../shared/engine/GameEngine.js';
import { ScoreEntry } from '../shared/score/ScoreManager.js';
import { CountdownTimer } from '../shared/ui/countdownTimer.js';
import { setupHud } from '../shared/ui/hud.js';

/**
 * Configuration specific to the typing game.
 */
interface TypingConfig extends GameConfig {
  /** Game duration, in seconds. */
  timeLimit?: number;
}

/**
 * Typing speed metrics.
 */
interface SpeedMetrics {
  /** Words per minute. */
  wpm: number;
  /** Letters per minute. */
  lpm: number;
}

/**
 * Leaderboard entry enriched with the typing metrics.
 */
interface TypingScoreEntry extends ScoreEntry {
  /** Total number of correctly typed letters. */
  letters: number;
  /** Words per minute. */
  wpm: number;
  /** Letters per minute. */
  lpm: number;
}

/**
 * Typing game.
 *
 * The player types the displayed words within a time limit; each correct word
 * earns one point. Unlike the other games, this one does not use the
 * `requestAnimationFrame` loop: `start()` is overridden with a one-second
 * `setInterval` (the timer), and the display is driven by typing and resize
 * events.
 */
export class TypingGame extends GameEngine {
  private words: string[] = [];
  private currentWordIndex: number = 0;
  private readonly timeLimit: number;
  private letterCount: number = 0;
  /** Shared one-second countdown; ends the game when it reaches zero. */
  private readonly chrono = new CountdownTimer();

  private wordContainer: HTMLElement | null = null;
  private wordInput: HTMLInputElement | null = null;

  /** Number of upcoming words shown as a preview below the current word. */
  private static readonly UPCOMING_COUNT = 3;

  /**
   * @param config Game configuration (game duration).
   */
  constructor(config: TypingConfig = {}) {
    super({ ...config, storageKey: 'typing-scores', leaderboardId: 'typing' });
    this.timeLimit = config.timeLimit || 60;
  }

  /**
   * Binds the DOM elements, wires up the listeners, loads the word list then
   * performs the first display (words, leaderboard, score, timer).
   */
  async initialize(): Promise<void> {
    this.wordContainer = document.getElementById('wordContainer');
    this.wordInput = document.getElementById('wordInput') as HTMLInputElement;
    this.hud = setupHud([
      { key: 'score', icon: 'star', label: 'Score' },
      { key: 'time', icon: 'clock', label: 'Time' },
    ]);

    this.setupEventListeners();
    this.words = await this.loadWords();
    this.updateWords();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.updateChronoDisplay(this.timeLimit);
  }

  /**
   * Wires up the listeners specific to this game: typing in the input field
   * (Space validates the word, the first keystroke starts the timer). The
   * game-over overlay is wired by the engine via {@link GameEngine.onGameOver}.
   */
  protected setupEventListeners(): void {
    if (this.wordInput) {
      this.wordInput.addEventListener('keydown', (event) => {
        if (event.key === ' ') {
          event.preventDefault();
          this.checkWord();
        }
      });

      this.wordInput.addEventListener('input', () => {
        if (!this.state.isRunning) {
          this.start();
        }
        this.handleInputChange();
      });
    }
  }

  /**
   * Loads the word list from `/words.txt`, cleaned up and shuffled. On a network
   * error, returns a fallback list.
   */
  private async loadWords(): Promise<string[]> {
    try {
      const response = await fetch('/words.txt');
      const text = await response.text();
      return this.shuffleArray(
        text
          .split('\n')
          .map((word) => word.trim())
          .filter((word) => word.length > 0)
      );
    } catch (error) {
      console.error('Error while loading the words:', error);
      return ['erreur', 'chargement', 'mots'];
    }
  }

  /**
   * Shuffles an array in place (Fisher-Yates) and returns it.
   */
  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * No-op: this game does not use the `requestAnimationFrame` loop (display
   * driven by events). Required by the {@link GameEngine} contract.
   */
  update(_deltaTime: number): void {}

  /**
   * No-op: see {@link update}.
   */
  render(): void {}

  /**
   * No-op: inputs are handled via the listeners in {@link setupEventListeners}.
   */
  handleInput(_event: KeyboardEvent): void {}

  /**
   * Colors the current word letter by letter according to the input: green if
   * the typed letter is correct, red otherwise; the next expected letter is
   * marked `.active` (visual cursor). Letters not yet typed stay neutral.
   */
  private handleInputChange(): void {
    if (!this.wordInput || !this.wordContainer) return;

    const currentWord = this.words[this.currentWordIndex] ?? '';
    const input = this.wordInput.value;
    const letters = this.wordContainer.querySelectorAll<HTMLElement>('.focus-letter');

    letters.forEach((letterEl, i) => {
      letterEl.classList.remove('correct', 'incorrect', 'active');
      if (i < input.length) {
        const ok = input[i].toLowerCase() === currentWord[i]?.toLowerCase();
        letterEl.classList.add(ok ? 'correct' : 'incorrect');
      } else if (i === input.length) {
        letterEl.classList.add('active');
      }
    });
  }

  /**
   * Validates the typed word: counts the point and the letters if it is exact,
   * advances to the next word, and ends the game if the list is exhausted.
   */
  private checkWord(): void {
    if (!this.wordInput) return;

    const currentWord = this.words[this.currentWordIndex];
    const inputValue = this.wordInput.value.trim();

    if (inputValue === '') return;

    if (inputValue.toLowerCase() === currentWord.toLowerCase()) {
      this.addScore(1);
      this.letterCount += currentWord.length;
    }

    this.currentWordIndex++;
    this.wordInput.value = '';

    if (this.currentWordIndex < this.words.length) {
      this.updateWords();
    } else {
      this.gameOver();
    }
  }

  /**
   * Re-renders the typing area in "focus mode": the current word in large size
   * (one letter per `<span>` for live coloring), followed by a preview of the
   * upcoming words. Immediately recolors according to the input already present.
   */
  private updateWords(): void {
    if (!this.wordContainer) return;

    this.wordContainer.innerHTML = '';

    const current = this.words[this.currentWordIndex] ?? '';
    const focusWord = document.createElement('div');
    focusWord.className = 'focus-word';
    for (const letter of current) {
      const letterEl = document.createElement('span');
      letterEl.className = 'focus-letter';
      letterEl.textContent = letter;
      focusWord.appendChild(letterEl);
    }
    this.wordContainer.appendChild(focusWord);

    const upcoming = document.createElement('div');
    upcoming.className = 'upcoming';
    const start = this.currentWordIndex + 1;
    const end = Math.min(this.words.length, start + TypingGame.UPCOMING_COUNT);
    for (let j = start; j < end; j++) {
      const span = document.createElement('span');
      span.className = 'upcoming-word';
      span.textContent = this.words[j];
      upcoming.appendChild(span);
    }
    this.wordContainer.appendChild(upcoming);

    this.handleInputChange();
  }

  /**
   * Computes the typing speeds (words and letters per minute) over the time
   * elapsed since the start of the game.
   */
  private calculateSpeed(): SpeedMetrics {
    const minutes = (this.timeLimit - this.chrono.remaining) / 60;
    return {
      wpm: minutes > 0 ? Math.round(this.state.score / minutes) : 0,
      lpm: minutes > 0 ? Math.round(this.letterCount / minutes) : 0,
    };
  }

  /**
   * Starts the timer (one-second countdown). Overrides the engine's `start()`
   * so as not to use the `requestAnimationFrame` loop. The game ends at zero
   * seconds remaining.
   */
  start(): void {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;

    this.chrono.start({
      seconds: this.timeLimit,
      onTick: (remaining) => this.updateChronoDisplay(remaining),
      onExpire: () => this.gameOver(),
    });
  }

  /**
   * Stops the timer.
   */
  stop(): void {
    this.state.isRunning = false;
    this.chrono.stop();
  }

  /**
   * Resets the game: timer, word index, score and state, and re-enables the
   * input field.
   */
  reset(): void {
    this.stop();
    // Re-shuffle the list so "Play again" yields a different word order (the list is
    // only loaded/shuffled once, in initialize()).
    this.shuffleArray(this.words);
    this.currentWordIndex = 0;
    this.letterCount = 0;
    this.resetState();

    if (this.wordInput) {
      this.wordInput.disabled = false;
      this.wordInput.placeholder = 'Type the word here...';
      this.wordInput.style.opacity = '1';
      this.wordInput.style.cursor = 'text';
      this.wordInput.value = '';
    }

    this.updateWords();
    this.updateScoreDisplay();
    this.updateChronoDisplay(this.timeLimit);
  }

  /**
   * Stops the timer, disables the input, then delegates to the shared game-over
   * flow (Save/Restart modal).
   */
  protected onGameOver(): void {
    this.stop();

    if (this.wordInput) {
      this.wordInput.disabled = true;
      this.wordInput.placeholder = 'Game over!';
      this.wordInput.style.opacity = '0.7';
      this.wordInput.style.cursor = 'not-allowed';
    }

    super.onGameOver();
  }

  /**
   * Title of the game-over modal.
   */
  protected getGameOverTitle(): string {
    return 'Game over!';
  }

  /**
   * Details shown in the modal: correct words, typed letters and speeds.
   */
  protected getGameOverContent(): string {
    const speed = this.calculateSpeed();
    return `
      <div>Correct words: ${this.state.score}</div>
      <div>Typed letters: ${this.letterCount}</div>
      <div>Speed: ${speed.wpm} words/minute</div>
      <div>Speed: ${speed.lpm} letters/minute</div>
    `;
  }

  /**
   * Builds the leaderboard entry enriched with the typing metrics.
   */
  protected buildScoreEntry(username: string): TypingScoreEntry {
    const speed = this.calculateSpeed();
    return {
      username,
      score: this.state.score,
      letters: this.letterCount,
      wpm: speed.wpm,
      lpm: speed.lpm,
      date: new Date(),
    };
  }

  /**
   * Restart via a plain `reset()` (without restarting the loop): the game starts
   * again automatically on the next keystroke.
   */
  protected restartAfterGameOver(): void {
    this.reset();
  }

  /**
   * Leaderboard row enriched with a "Speed" column (words/min and letters/min).
   */
  protected scoreTableRow(entry: ScoreEntry): string {
    const e = entry as TypingScoreEntry;
    return `<td>${this.escapeHtml(e.username)}</td><td>${e.score}</td><td>${e.wpm} wpm / ${e.lpm} lpm</td>`;
  }

  /**
   * Shows the remaining time and turns the timer red below 10 seconds.
   */
  private updateChronoDisplay(remaining: number): void {
    this.hud?.set('time', remaining);
    this.hud?.toggle('time', 'is-low', remaining <= 10);
  }
}
