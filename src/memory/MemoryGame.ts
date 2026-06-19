import { GameEngine, GameConfig } from '../shared/GameEngine.js';

/**
 * Configuration specific to the Memory game.
 */
interface MemoryConfig extends GameConfig {
  /** Number of cells per grid side (must yield an even total; default: 4). */
  gridSize?: number;
}

/**
 * State of a grid card.
 */
type CardState = 'hidden' | 'flipped' | 'matched';

/**
 * A board card.
 */
interface Card {
  /** Font Awesome class of the symbol (two cards share the same one). */
  symbol: string;
  /** Current state of the card. */
  state: CardState;
}

/**
 * Pool of symbols (Font Awesome icons). Must contain at least as many entries as
 * pairs to form (8 for a 4×4 grid).
 */
const SYMBOLS = [
  'fa-apple-whole',
  'fa-star',
  'fa-heart',
  'fa-bolt',
  'fa-bell',
  'fa-anchor',
  'fa-bug',
  'fa-cat',
  'fa-crown',
  'fa-fish',
  'fa-ghost',
  'fa-leaf',
];

/**
 * Memory game (matching-pairs game).
 *
 * On a square grid of face-down cards, the player flips two: if they bear the
 * same symbol they stay visible (pair found), otherwise they flip back after a
 * short delay. The game is won when all pairs are found. The score rewards
 * efficiency (few moves) and speed, so that a higher score = a better game.
 *
 * Like 2048 and the typing game, this game is event-driven (mouse clicks) and
 * does not use the engine's `requestAnimationFrame` loop: {@link start} merely
 * activates the state and the render follows each action.
 */
export class MemoryGame extends GameEngine {
  private readonly gridSize: number;
  private readonly totalPairs: number;

  private cards: Card[] = [];
  /** Indices of the cards currently flipped, waiting for comparison. */
  private flippedIndices: number[] = [];
  /** Lock during the flip-back animation of a missed pair. */
  private locked = false;

  private moves = 0;
  private matchedPairs = 0;
  /** Timestamp of the first move (null until the game has started). */
  private startTime: number | null = null;
  private elapsedSeconds = 0;

  private boardElement: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private movesElement: HTMLElement | null = null;
  private highScoreElement: HTMLElement | null = null;

  /**
   * @param config Game configuration (grid size).
   */
  constructor(config: MemoryConfig = {}) {
    super({ ...config, storageKey: 'memory-scores' });
    this.gridSize = config.gridSize || 4;
    this.totalPairs = (this.gridSize * this.gridSize) / 2;
  }

  /**
   * Binds the DOM elements, wires up the clicks, builds the shuffled board then
   * performs the first render (cards, leaderboard, score).
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.movesElement = document.querySelector('.moves');
    this.highScoreElement = document.querySelector('.high-score');

    if (this.boardElement) {
      this.boardElement.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;
    }

    this.setupEventListeners();
    this.buildBoard();
    this.renderScoreTable();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Wires up the click listener (delegated on the board) specific to this game,
   * instead of the engine's default keyboard listening.
   */
  protected setupEventListeners(): void {
    this.boardElement?.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.memory-card');
      if (card?.dataset.index !== undefined) {
        this.onCardClick(Number(card.dataset.index));
      }
    });
  }

  /**
   * Activates the game state without starting the `requestAnimationFrame` loop:
   * Memory is driven by clicks (see {@link onCardClick}).
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
   * No-op: the game does not use the keyboard. Required by the {@link GameEngine}
   * contract (input goes through {@link onCardClick}).
   */
  handleInput(_event: KeyboardEvent): void {}

  /**
   * Handles a click on the card at the given index: flips the card, and as soon
   * as a second card is flipped, compares the pair (success → cards locked,
   * failure → flip back after a short delay).
   */
  private onCardClick(index: number): void {
    if (this.locked || this.state.isGameOver) return;

    const card = this.cards[index];
    if (!card || card.state !== 'hidden') return;

    if (this.startTime === null) this.startTime = Date.now();

    card.state = 'flipped';
    this.flippedIndices.push(index);
    this.render();

    if (this.flippedIndices.length === 2) {
      this.moves++;
      this.updateScoreDisplay();
      this.checkPair();
    }
  }

  /**
   * Compares the two flipped cards: if they match, marks them found and credits
   * the score, otherwise flips them face-down again after a delay.
   */
  private checkPair(): void {
    const [first, second] = this.flippedIndices;

    if (this.cards[first].symbol === this.cards[second].symbol) {
      this.cards[first].state = 'matched';
      this.cards[second].state = 'matched';
      this.flippedIndices = [];
      this.matchedPairs++;
      this.addScore(100);
      this.render();

      if (this.matchedPairs === this.totalPairs) {
        this.finishGame();
      }
      return;
    }

    this.locked = true;
    window.setTimeout(() => {
      this.cards[first].state = 'hidden';
      this.cards[second].state = 'hidden';
      this.flippedIndices = [];
      this.locked = false;
      this.render();
    }, 800);
  }

  /**
   * Ends the won game: adds the efficiency bonus (few moves) and the speed
   * bonus, then triggers the game-over flow.
   */
  private finishGame(): void {
    this.elapsedSeconds = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;

    const extraMoves = Math.max(0, this.moves - this.totalPairs);
    const efficiencyBonus = Math.max(0, 500 - extraMoves * 20);
    const timeBonus = Math.max(0, 300 - this.elapsedSeconds * 3);
    this.addScore(efficiencyBonus + timeBonus);

    this.gameOver();
  }

  /**
   * Rebuilds the board from a shuffle of symbol pairs and creates the card
   * elements (icon on the back revealed on flip).
   */
  private buildBoard(): void {
    if (!this.boardElement) return;

    const symbols = SYMBOLS.slice(0, this.totalPairs);
    const deck = [...symbols, ...symbols];
    this.shuffle(deck);

    this.cards = deck.map((symbol) => ({ symbol, state: 'hidden' }));

    this.boardElement.innerHTML = this.cards
      .map(
        (card, index) => `
          <button class="memory-card" data-index="${index}" aria-label="Carte">
            <span class="memory-card-inner">
              <span class="memory-card-face memory-card-back">
                <i class="fas fa-question" aria-hidden="true"></i>
              </span>
              <span class="memory-card-face memory-card-front">
                <i class="fas ${card.symbol}" aria-hidden="true"></i>
              </span>
            </span>
          </button>`
      )
      .join('');
  }

  /**
   * Reflects each card's state on its DOM element (classes `is-flipped` /
   * `is-matched`), without rebuilding the board.
   */
  render(): void {
    if (!this.boardElement) return;

    const elements = this.boardElement.querySelectorAll<HTMLElement>('.memory-card');
    this.cards.forEach((card, index) => {
      const element = elements[index];
      if (!element) return;
      element.classList.toggle('is-flipped', card.state !== 'hidden');
      element.classList.toggle('is-matched', card.state === 'matched');
    });
  }

  /**
   * Shuffles an array in place (Fisher–Yates).
   */
  private shuffle<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Resets board, score and counters, then performs the render.
   */
  reset(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.flippedIndices = [];
    this.locked = false;
    this.moves = 0;
    this.matchedPairs = 0;
    this.startTime = null;
    this.elapsedSeconds = 0;
    this.buildBoard();
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Shows the current score, the number of moves and the high score in the header.
   */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) {
      this.scoreElement.textContent = `Score: ${this.state.score}`;
    }
    if (this.movesElement) {
      this.movesElement.textContent = `Coups: ${this.moves}`;
    }
    if (this.highScoreElement) {
      this.highScoreElement.textContent = `Meilleur: ${this.scoreManager.getHighScore()}`;
    }
  }

  /**
   * Modal title: the game ends with a victory (all pairs found).
   */
  protected getGameOverTitle(): string {
    return 'Bravo !';
  }

  /**
   * Rich summary shown in `.score-details` (moves, time, score).
   */
  protected getGameOverContent(): string {
    return `
      <p>Toutes les paires trouvées !</p>
      <p>Coups : ${this.moves} — Temps : ${this.elapsedSeconds}s</p>
      <p>Score : ${this.state.score}</p>`;
  }
}
