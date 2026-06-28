import { GameEngine, GameConfig } from '../shared/engine/GameEngine.js';
import { Difficulty } from '../shared/bot/difficulty.js';
import {
  rememberCard,
  findKnownPair,
  pickFirst,
  pickSecond,
  botPlaysSmart,
} from '../shared/bot/memoryBot.js';
import { VersusRole } from '../shared/versus/opponent.js';
import { setupSettingsPanel, SettingsPanelHandle } from '../shared/ui/settingsPanel.js';
import { setupMultiplayerPanel, MultiplayerHandle } from '../shared/versus/multiplayerPanel.js';
import { NetMatch, MatchMessage } from '../shared/net/match.js';
import { runCountdown } from '../shared/ui/countdown.js';
import { dismissStartOverlay } from '../shared/ui/startOverlay.js';
import { GameOverlayButton } from '../shared/ui/gameOverlay.js';

/** State of a grid card. */
type CardState = 'hidden' | 'flipped' | 'matched';

/** A board card. */
interface Card {
  symbol: string;
  state: CardState;
}

/**
 * Symbol pool (Font Awesome solid icons). Needs ≥ 32 entries for the 8×8 grid
 * (32 pairs).
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
  'fa-car',
  'fa-rocket',
  'fa-tree',
  'fa-moon',
  'fa-sun',
  'fa-cloud',
  'fa-key',
  'fa-gift',
  'fa-bomb',
  'fa-camera',
  'fa-music',
  'fa-bicycle',
  'fa-plane',
  'fa-umbrella',
  'fa-snowflake',
  'fa-fire',
  'fa-gem',
  'fa-mug-hot',
  'fa-dog',
  'fa-dragon',
];

/** Difficulty → grid side (4×4 / 6×6 / 8×8). Also drives the bot's memory skill. */
const DIFFICULTY_SIZE: Record<Difficulty, number> = { easy: 4, medium: 6, hard: 8 };

/** Seconds a player has to complete a turn before an automatic move is played. */
const TURN_TIME = 15;
/** Delay (ms) a missed pair stays revealed before flipping back. */
const FLIP_BACK_DELAY = 1000;
/** Delay (ms) between the bot's two flips, so the player can follow. */
const BOT_STEP_DELAY = 700;
/** Beat (ms) between the last pair and the result overlay. */
const END_DELAY = 700;

/** Turn-based match op codes exchanged over the relay (see net/match.ts). */
const OP_INIT = 1; // host → guest: { size, deck } — identical board + host starts
const OP_FLIP = 2; // active player → other: { index } a card was flipped

/** Board snapshot the host sends so both clients deal the exact same cards. */
interface InitState {
  size: number;
  deck: string[];
}

/**
 * Memory — turn-based matching-pairs game, playable vs a bot or vs a human online.
 *
 * The grid size is the difficulty (4×4 / 6×6 / 8×8), which also tunes the bot's
 * memory. Players alternate turns: flip two cards; a matched pair scores +1 and
 * you play again, a miss passes the turn. Each turn has a {@link TURN_TIME}s
 * timer; on timeout an automatic move is played. Most pairs at the end wins.
 *
 * Multiplayer is **turn-based and deterministic** (a new path, lighter than
 * Pong's realtime sync): the host shares the shuffled deck once ({@link OP_INIT}),
 * then each side just relays its flips ({@link OP_FLIP}) — both compute the same
 * resolution and turn order locally. Reuses the shared session panel + countdown.
 */
export class MemoryGame extends GameEngine {
  /** Who the opponent is / authority model (see {@link VersusRole}). */
  private role: VersusRole = 'solo';
  private difficulty: Difficulty = 'easy';
  private gridSize = DIFFICULTY_SIZE.easy;
  private totalPairs = (this.gridSize * this.gridSize) / 2;

  private cards: Card[] = [];
  /** Indices currently face up this move (max 2). */
  private flipped: number[] = [];
  private matchedPairs = 0;
  /** Whose turn it is: the local player or the opponent (bot/remote). */
  private turn: 'self' | 'other' = 'self';
  /** Blocks input during resolution, the opponent's turn, or the countdown. */
  private locked = false;
  /** Opponent score; the local player's score is the engine's `state.score`. */
  private opponentScore = 0;

  /** The bot's remembered cards (solo only): index → symbol. */
  private botMemory = new Map<number, string>();

  /** Per-turn countdown. */
  private turnTimer: number | null = null;
  private timeLeft = TURN_TIME;

  private net: NetMatch | null = null;
  private multiplayer: MultiplayerHandle | null = null;
  private settings: SettingsPanelHandle | null = null;

  private boardElement: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private opponentScoreElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;

  constructor(config: GameConfig = {}) {
    super({ ...config, storageKey: 'memory' });
    this.applyDifficulty();
  }

  /** Binds the DOM, wires controls + panels, builds the initial (solo) board. */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.opponentScoreElement = document.querySelector('.opp-score');
    this.statusElement = document.querySelector('.memory-status');

    this.setupEventListeners();
    this.settings = setupSettingsPanel([
      {
        id: 'difficulty',
        label: 'Difficulté',
        value: this.difficulty,
        choices: [
          { label: 'Facile 4×4', value: 'easy' },
          { label: 'Moyen 6×6', value: 'medium' },
          { label: 'Difficile 8×8', value: 'hard' },
        ],
        onChange: (value) => {
          this.difficulty = value as Difficulty;
          this.applyDifficulty();
          // Only restart a running game; otherwise just re-prepare the board and
          // keep the Play screen (changing a setting must NOT start the game).
          if (this.state.isRunning && this.role === 'solo') {
            this.restartSolo();
          } else {
            this.role = 'solo';
            this.reset();
          }
        },
      },
    ]);
    this.multiplayer = setupMultiplayerPanel({
      onSessionStart: (net) => this.beginVersus(net),
      onSessionEnd: () => this.endVersus(),
    });

    this.buildBoard();
    this.resetMatchState();
    this.updateScoreDisplay();
    this.updateStatus();
    this.render();
  }

  /** Click delegation on the board → flip the clicked card. */
  protected setupEventListeners(): void {
    this.boardElement?.addEventListener('click', (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.memory-card');
      const index = card?.dataset.index;
      if (index !== undefined) this.flipCard(Number(index));
    });
  }

  /** Maps the difficulty to the grid size and pair count. */
  private applyDifficulty(): void {
    this.gridSize = DIFFICULTY_SIZE[this.difficulty];
    this.totalPairs = (this.gridSize * this.gridSize) / 2;
  }

  /** No continuous loop: Memory is event-driven. Required by the engine. */
  update(_deltaTime: number): void {}
  /** Input is handled via clicks (see {@link setupEventListeners}). */
  handleInput(_event: KeyboardEvent): void {}

  /**
   * Starts a solo match (called by the Play screen). Multiplayer starts through
   * {@link beginVersus} instead.
   */
  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    if (this.role === 'solo') this.beginTurn('self');
  }

  /* --- Turn flow ----------------------------------------------------------- */

  /** Begins a turn for the given side: arms input + timer, or the bot/remote. */
  private beginTurn(who: 'self' | 'other'): void {
    dismissStartOverlay();
    this.turn = who;
    this.flipped = [];
    this.locked = who !== 'self';
    this.timeLeft = TURN_TIME;
    this.updateStatus();

    if (who === 'self') {
      this.startTurnTimer();
    } else {
      this.stopTurnTimer();
      if (this.role === 'solo') this.scheduleBotMove();
      // In multiplayer the remote drives its turn and relays flips to us.
    }
  }

  /**
   * Flips a card. `fromRemote` bypasses the local-turn guard (used for the bot's
   * own flips and for flips received from the network).
   */
  private flipCard(index: number, fromRemote = false): void {
    if (this.state.isGameOver) return;
    if (!fromRemote && (this.turn !== 'self' || this.locked)) return;

    const card = this.cards[index];
    if (!card || card.state !== 'hidden') return;

    card.state = 'flipped';
    this.flipped.push(index);
    this.render();

    // The bot learns from every reveal (with its difficulty's retention).
    if (this.role === 'solo') {
      rememberCard(this.botMemory, index, card.symbol, this.difficulty);
    }
    // Relay our own moves to the opponent online.
    if (this.role !== 'solo' && !fromRemote) {
      this.net?.send(OP_FLIP, { index });
    }

    if (this.flipped.length === 2) {
      this.locked = true;
      this.stopTurnTimer();
      this.resolveMove();
    }
  }

  /** Resolves the two flipped cards: score + replay on a match, else flip back + pass. */
  private resolveMove(): void {
    const [a, b] = this.flipped;
    const matched = this.cards[a].symbol === this.cards[b].symbol;

    if (matched) {
      this.cards[a].state = 'matched';
      this.cards[b].state = 'matched';
      this.matchedPairs += 1;
      if (this.turn === 'self') this.state.score += 1;
      else this.opponentScore += 1;
      this.flipped = [];
      this.updateScoreDisplay();
      this.render();

      if (this.matchedPairs === this.totalPairs) {
        this.endMatch();
        return;
      }
      this.beginTurn(this.turn); // same player continues
      return;
    }

    this.render();
    window.setTimeout(() => {
      if (this.state.isGameOver) return;
      this.cards[a].state = 'hidden';
      this.cards[b].state = 'hidden';
      this.flipped = [];
      this.render();
      this.beginTurn(this.turn === 'self' ? 'other' : 'self');
    }, FLIP_BACK_DELAY);
  }

  /** Indices of cards still in play (face down). */
  private hiddenIndices(): number[] {
    const indices: number[] = [];
    this.cards.forEach((card, index) => {
      if (card.state === 'hidden') indices.push(index);
    });
    return indices;
  }

  /* --- Per-turn timer ------------------------------------------------------ */

  private startTurnTimer(): void {
    this.stopTurnTimer();
    this.timeLeft = TURN_TIME;
    this.updateStatus();
    this.turnTimer = window.setInterval(() => {
      this.timeLeft -= 1;
      if (this.timeLeft <= 0) {
        this.stopTurnTimer();
        this.onTurnTimeout();
      } else {
        this.updateStatus();
      }
    }, 1000);
  }

  private stopTurnTimer(): void {
    if (this.turnTimer !== null) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }
  }

  /**
   * Time's up: play ONE automatic move by flipping the remaining random card(s).
   * The cards are chosen up front and flipped — we must NOT loop on
   * `flipped.length`, since a lucky match resets it and would chain extra moves.
   */
  private onTurnTimeout(): void {
    if (this.turn !== 'self' || this.state.isGameOver) return;
    const need = 2 - this.flipped.length;
    for (const index of this.sample(this.hiddenIndices(), need)) {
      this.flipCard(index);
    }
  }

  /** Returns up to `count` distinct random elements from `pool`. */
  private sample(pool: number[], count: number): number[] {
    const copy = pool.slice();
    const picks: number[] = [];
    for (let i = 0; i < count && copy.length > 0; i++) {
      picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return picks;
  }

  /* --- Bot (solo) ---------------------------------------------------------- */

  /**
   * Schedules the bot's two flips. Each turn it either plays smart (uses its
   * memory) or — with the difficulty's odds — plays a dumb random move (empty
   * memory), so even the hard bot gives the player openings.
   */
  private scheduleBotMove(): void {
    const hidden = this.hiddenIndices();
    const smart = botPlaysSmart(this.difficulty);
    const memory = smart ? this.botMemory : new Map<number, string>();
    const known = smart ? findKnownPair(this.botMemory, new Set(hidden)) : null;
    const first = known ? known[0] : pickFirst(memory, hidden);

    window.setTimeout(() => {
      if (this.state.isGameOver || this.turn !== 'other') return;
      this.flipCard(first, true);
      const firstSymbol = this.cards[first].symbol;
      const second = known
        ? known[1]
        : pickSecond(memory, this.hiddenIndices(), first, firstSymbol);
      window.setTimeout(() => {
        if (this.state.isGameOver || this.turn !== 'other') return;
        this.flipCard(second, true);
      }, BOT_STEP_DELAY);
    }, BOT_STEP_DELAY);
  }

  /* --- Board build / render ------------------------------------------------ */

  /** Builds a fresh shuffled board for the current grid size (host/solo). */
  private buildBoard(): void {
    const symbols = SYMBOLS.slice(0, this.totalPairs);
    this.setDeck(this.shuffle([...symbols, ...symbols]));
  }

  /** Builds the board from a deck received from the host (guest). */
  private buildBoardFromDeck(deck: string[]): void {
    this.setDeck(deck.slice());
  }

  /** Sets the card model from a deck and (re)renders the board DOM. */
  private setDeck(deck: string[]): void {
    this.cards = deck.map((symbol) => ({ symbol, state: 'hidden' as CardState }));
    if (!this.boardElement) return;
    this.boardElement.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;
    // Icon size relative to the (square) board so every grid fits — see memory.css.
    this.boardElement.style.setProperty('--memory-icon', `${(46 / this.gridSize).toFixed(1)}cqmin`);
    this.boardElement.innerHTML = this.cards
      .map(
        (card, index) => `
          <button class="memory-card" data-index="${index}" type="button" aria-label="Carte">
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

  /** Reflects each card's state on its element (no rebuild). */
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

  /** Fisher–Yates shuffle, returns the array. */
  private shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /** Clears scores, flips, matches and bot memory (keeps the cards). */
  private resetMatchState(): void {
    this.state.score = 0;
    this.opponentScore = 0;
    this.matchedPairs = 0;
    this.flipped = [];
    this.locked = false;
    this.timeLeft = TURN_TIME;
    this.botMemory.clear();
  }

  /** Rebuilds a fresh solo board and counters (without starting). */
  reset(): void {
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.resetMatchState();
    this.buildBoard();
    this.turn = 'self';
    this.updateScoreDisplay();
    this.updateStatus();
    this.render();
  }

  /* --- Displays ------------------------------------------------------------ */

  protected updateScoreDisplay(): void {
    if (this.scoreElement) this.scoreElement.textContent = `Toi : ${this.state.score}`;
    if (this.opponentScoreElement) {
      const label = this.role === 'solo' ? 'Bot' : 'Adversaire';
      this.opponentScoreElement.textContent = `${label} : ${this.opponentScore}`;
    }
  }

  /** Shows whose turn it is and, on the local turn, the countdown. */
  private updateStatus(): void {
    if (!this.statusElement) return;
    let text: string;
    if (this.turn === 'self') {
      text = `À toi · ${Math.max(0, this.timeLeft)}s`;
    } else {
      text = this.role === 'solo' ? 'Tour du bot…' : 'Tour de l’adversaire…';
    }
    this.statusElement.textContent = text;
    this.statusElement.classList.toggle('is-low', this.turn === 'self' && this.timeLeft <= 5);
  }

  /* --- End of match -------------------------------------------------------- */

  /** Freezes play and reveals the result after a short beat. */
  private endMatch(): void {
    this.stopTurnTimer();
    this.locked = true;
    window.setTimeout(() => this.gameOver(), END_DELAY);
  }

  /** Shows the result overlay (solo: Rejouer; multi: Revanche (host) / Quitter). */
  protected onGameOver(): void {
    this.stopTurnTimer();
    const selfPairs = this.state.score;
    const otherPairs = this.opponentScore;
    const title =
      selfPairs === otherPairs ? 'Égalité !' : selfPairs > otherPairs ? 'Gagné ! 🏆' : 'Perdu…';
    const oppLabel = this.role === 'solo' ? 'Bot' : 'Adversaire';

    const buttons: GameOverlayButton[] = [];
    if (this.role === 'solo') {
      buttons.push({ text: 'Rejouer', primary: true, onClick: () => this.restartSolo() });
    } else if (this.role === 'host') {
      buttons.push({
        text: 'Revanche',
        primary: true,
        onClick: () => {
          this.overlay.hide();
          this.hostStartMatch();
        },
      });
    }
    buttons.push({
      text: 'Quitter',
      primary: this.role === 'guest',
      onClick: () => {
        this.overlay.hide();
        this.multiplayer?.leave();
      },
    });

    const waiting =
      this.role === 'guest' ? '<p class="mp-status">En attente d’une revanche de l’hôte…</p>' : '';
    this.overlay.show({
      title,
      bodyHtml: `<div>Toi : ${selfPairs} — ${oppLabel} : ${otherPairs}</div>${waiting}`,
      buttons,
    });
  }

  /** Restarts a solo match from a clean board (Rejouer / difficulty change). */
  private restartSolo(): void {
    this.overlay.hide();
    this.role = 'solo';
    this.stopTurnTimer();
    this.reset();
    this.state.isRunning = true;
    this.beginTurn('self');
  }

  /* --- Multiplayer (turn-based, relayed) ----------------------------------- */

  /** Enters a session: adopts the role, wires messages, host deals the board. */
  private beginVersus(net: NetMatch): void {
    this.net = net;
    this.role = net.role;
    this.settings?.setDisabled(true);
    net.onMessage((msg) => this.handleNetMessage(msg));
    if (net.role === 'host') this.hostStartMatch();
    // The guest waits for OP_INIT to build the same board.
  }

  /** Host: deals a fresh board, shares it, and starts (host plays first). */
  private hostStartMatch(): void {
    this.applyDifficulty();
    this.buildBoard();
    this.net?.send(OP_INIT, { size: this.gridSize, deck: this.cards.map((c) => c.symbol) });
    this.startVersus('self');
  }

  /** Resets counters and kicks off a versus round behind a countdown. */
  private startVersus(starting: 'self' | 'other'): void {
    this.overlay.hide();
    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.resetMatchState();
    this.updateScoreDisplay();
    this.locked = true;
    this.turn = starting;
    this.updateStatus();
    this.render();
    void runCountdown(3).then(() => {
      if (this.net) this.beginTurn(starting);
    });
  }

  /** Dispatches a relayed message. */
  private handleNetMessage(msg: MatchMessage): void {
    if (msg.opCode === OP_INIT && this.role === 'guest') {
      const init = msg.data as InitState | null;
      if (!init) return;
      this.gridSize = init.size;
      this.totalPairs = (init.size * init.size) / 2;
      this.buildBoardFromDeck(init.deck);
      this.startVersus('other'); // the host plays first
      return;
    }
    if (msg.opCode === OP_FLIP) {
      const data = msg.data as { index?: number } | null;
      // Apply the opponent's flip only while it is their turn.
      if (this.turn === 'other' && data && typeof data.index === 'number') {
        this.flipCard(data.index, true);
      }
    }
  }

  /** Leaves multiplayer: back to a solo match vs the bot. */
  private endVersus(): void {
    this.net = null;
    this.role = 'solo';
    this.settings?.setDisabled(false);
    this.stopTurnTimer();
    this.overlay.hide();
    this.applyDifficulty();
    this.reset();
    this.state.isRunning = true;
    this.beginTurn('self');
  }
}
