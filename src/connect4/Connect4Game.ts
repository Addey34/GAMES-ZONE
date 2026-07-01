import { GameEngine } from '../shared/engine/GameEngine.js';
import { dismissStartOverlay } from '../shared/ui/startOverlay.js';
import { setupSettingsPanel, SettingsPanelHandle } from '../shared/ui/settingsPanel.js';
import { CountdownTimer } from '../shared/ui/countdownTimer.js';
import { setupHud } from '../shared/ui/hud.js';
import { Difficulty } from '../shared/bot/difficulty.js';
import { setupMultiplayerPanel, MultiplayerHandle } from '../shared/versus/multiplayerPanel.js';
import { NetMatch, MatchMessage } from '../shared/net/match.js';
import { GameOverlayButton } from '../shared/ui/gameOverlay.js';
import {
  Connect4State,
  Connect4Move,
  COLS,
  ROWS,
  SEATS,
  initialState,
  legalMoves,
  applyMove,
  isFull,
  discAt,
} from './connect4.js';
import { decideMove } from './connect4Bot.js';

/** Pacing (ms) so a human can follow the bot / remote plays. */
const BOT_DELAY = 550;
const NEXT_TURN_DELAY = 250;
/** Beat (ms) after the final disc lands before the result overlay is shown. */
const END_DELAY = 550;
/** Seconds a human has to drop before a move is played automatically. */
const TURN_SECONDS = 20;

/** Match-state op codes exchanged over the relay (see net/match.ts, must be < 1000). */
const OP_STATE = 1; // host → guest: { game } authoritative board snapshot
const OP_MOVE = 2; // guest → host: { seat, col } chosen column
const OP_RESTART = 3; // host → guest: start a fresh round (rematch)
const OP_TIMER = 4; // host → guest: { t } current turn countdown (null clears it)

/**
 * Connect 4 controller: a turn-based game (like Ludo, minus the dice) playable
 * **solo** (human = seat 0 red, bot = seat 1 yellow) or **1-v-1 online** over the
 * relay. It renders the 7×6 board and lets the player drop a disc by clicking a
 * column or aiming with the keyboard.
 *
 * It extends {@link GameEngine} for the score/overlay/lifecycle plumbing but drives
 * its own async turn sequence instead of the rAF loop; a generation counter
 * cancels a stale flow on reset. Networking is **host-authoritative**: the host
 * owns the single {@link Connect4State}, plays the bot for an empty seat, and
 * broadcasts the state after each drop; the guest renders it and sends only its
 * own column ({@link OP_MOVE}), which the host validates before applying.
 */
export class Connect4Game extends GameEngine {
  private game: Connect4State = initialState();
  private difficulty: Difficulty = 'medium';

  /** 'solo' = local human (seat 0) vs bot; 'net' = relayed 1-v-1. */
  private mode: 'solo' | 'net' = 'solo';
  private net: NetMatch | null = null;
  private multiplayer: MultiplayerHandle | null = null;
  private settings: SettingsPanelHandle | null = null;
  /** This client's seat (0 in solo / for the host). */
  private mySeat = 0;
  /** Seats driven by a human (the rest are bots). */
  private humanSeats = new Set<number>([0]);
  /** Host-side: the seat whose network move we are awaiting, or null. */
  private pendingSeat: number | null = null;

  private boardEl: HTMLElement | null = null;
  /** Column elements and their cells (`cellEls[col][rowFromTop]`). */
  private colEls: HTMLElement[] = [];
  private cellEls: HTMLElement[][] = [];
  /** The column the human is currently aiming at (mouse hover / keyboard). */
  private cursorCol = Math.floor(COLS / 2);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly turnTimer = new CountdownTimer();
  /** Bumped on every (re)start/reset to abandon any in-flight async turn. */
  private gen = 0;
  /** True while waiting for the local human to drop a disc. */
  private awaitingHuman = false;

  constructor() {
    super({ storageKey: 'connect4' });
  }

  initialize(): void {
    this.boardEl = document.getElementById('board');
    this.hud = setupHud([
      { key: 'turn', icon: 'circle-dot', label: 'Turn' },
      { key: 'time', icon: 'clock', label: 'Time' },
    ]);

    this.buildBoard();
    this.setupEventListeners();
    this.setupBoardPointer();

    this.settings = setupSettingsPanel([
      {
        id: 'difficulty',
        label: 'Bot',
        choices: [
          { label: 'Easy', value: 'easy' },
          { label: 'Medium', value: 'medium' },
          { label: 'Hard', value: 'hard' },
        ],
        value: this.difficulty,
        onChange: (value) => {
          this.difficulty = value as Difficulty;
        },
      },
    ]);
    this.multiplayer = setupMultiplayerPanel({
      capacity: SEATS,
      onSessionStart: (net) => this.beginNet(net),
      onSessionEnd: () => this.endNet(),
    });

    this.game = initialState();
    this.updateTurnDisplay();
    this.renderBoard();
  }

  /** Builds the 7×6 grid of columns and cells once (state is applied in render). */
  private buildBoard(): void {
    const board = this.boardEl;
    if (!board) return;
    board.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'connect4-grid';

    this.colEls = [];
    this.cellEls = [];
    for (let col = 0; col < COLS; col++) {
      const colEl = document.createElement('div');
      colEl.className = 'connect4-col';
      colEl.dataset.col = String(col);
      const cells: HTMLElement[] = [];
      for (let rowTop = 0; rowTop < ROWS; rowTop++) {
        const cell = document.createElement('div');
        cell.className = 'connect4-cell';
        const disc = document.createElement('span');
        disc.className = 'connect4-disc';
        cell.appendChild(disc);
        colEl.appendChild(cell);
        cells.push(cell);
      }
      grid.appendChild(colEl);
      this.colEls.push(colEl);
      this.cellEls.push(cells);
    }
    board.appendChild(grid);
  }

  /** Click to drop, hover to aim (pointer complement to the keyboard input). */
  private setupBoardPointer(): void {
    this.boardEl?.addEventListener('click', (event) => {
      const col = this.columnOf(event.target);
      if (col !== null) this.playColumn(col);
    });
    this.boardEl?.addEventListener('mousemove', (event) => {
      if (!this.awaitingHuman) return;
      const col = this.columnOf(event.target);
      if (col !== null && col !== this.cursorCol) {
        this.cursorCol = col;
        this.renderBoard();
      }
    });
  }

  /** The column index under an event target, or null. */
  private columnOf(target: EventTarget | null): number | null {
    const colEl = (target as HTMLElement | null)?.closest<HTMLElement>('.connect4-col');
    return colEl?.dataset.col !== undefined ? Number(colEl.dataset.col) : null;
  }

  /** Keyboard: ← → to aim a column, ↓ / Enter / Space to drop. */
  handleInput(event: KeyboardEvent): void {
    if (!this.awaitingHuman || this.game.current !== this.mySeat) return;
    switch (event.key) {
      case 'ArrowLeft':
        this.moveCursor(-1);
        event.preventDefault();
        break;
      case 'ArrowRight':
        this.moveCursor(1);
        event.preventDefault();
        break;
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        this.playColumn(this.cursorCol);
        event.preventDefault();
        break;
    }
  }

  private moveCursor(delta: number): void {
    this.cursorCol = Math.max(0, Math.min(COLS - 1, this.cursorCol + delta));
    this.renderBoard();
  }

  /** Reflects the state on the board, plus the aiming ghost on the human's turn. */
  private renderBoard(): void {
    const columns = this.game.columns;
    const aiming =
      this.awaitingHuman && this.game.current === this.mySeat && this.game.winner === null;
    const ghostCol = aiming ? this.cursorCol : -1;
    const ghostRowTop =
      ghostCol >= 0 && columns[ghostCol].length < ROWS ? ROWS - 1 - columns[ghostCol].length : -1;

    for (let col = 0; col < COLS; col++) {
      this.colEls[col]?.classList.toggle('is-aim', aiming && col === ghostCol);
      for (let rowTop = 0; rowTop < ROWS; rowTop++) {
        const cell = this.cellEls[col]?.[rowTop];
        if (!cell) continue;
        const disc = discAt(columns, col, ROWS - 1 - rowTop);
        cell.classList.toggle('is-p0', disc === 0);
        cell.classList.toggle('is-p1', disc === 1);
        const ghost = col === ghostCol && rowTop === ghostRowTop;
        cell.classList.toggle('is-ghost', ghost);
        cell.classList.toggle('is-ghost-p0', ghost && this.mySeat === 0);
        cell.classList.toggle('is-ghost-p1', ghost && this.mySeat === 1);
      }
    }
  }

  /** Writes whose turn it is into the HUD. */
  private updateTurnDisplay(): void {
    const seat = this.game.current;
    let text: string;
    if (this.game.winner !== null || isFull(this.game)) text = '—';
    else if (seat === this.mySeat) text = 'Your turn';
    else if (this.humanSeats.has(seat)) text = "Opponent's turn";
    else text = "Bot's turn";
    this.hud?.set('turn', text);
  }

  /** Begins the solo/host game loop (no rAF, just the turn sequence). */
  start(): void {
    if (this.state.isRunning) return;
    dismissStartOverlay();
    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.gen++;
    void this.runTurn();
  }

  /** Whether `seat` is a remote guest the host must wait on (not its own seat). */
  private isRemoteHuman(seat: number): boolean {
    return this.mode === 'net' && this.humanSeats.has(seat) && seat !== this.mySeat;
  }

  /** A bot move for the current state (used by the bot seat and the auto-play safety). */
  private botMove(): Connect4Move {
    return decideMove(this.game, legalMoves(this.game), this.difficulty);
  }

  /** One turn (host/solo authority): enable the local human, await a guest, or play a bot. */
  private async runTurn(): Promise<void> {
    const gen = this.gen;
    if (!this.state.isRunning) return;
    this.awaitingHuman = false;
    this.pendingSeat = null;
    this.updateTurnDisplay();

    const seat = this.game.current;
    if (seat === this.mySeat) {
      // Local human: drop by click/keyboard, or auto-play at the countdown's end.
      this.awaitingHuman = true;
      this.renderBoard();
      this.startCountdown(() => {
        if (this.awaitingHuman) this.commitMove(this.botMove());
      });
    } else if (this.isRemoteHuman(seat)) {
      // Remote guest: wait for its OP_MOVE, auto-play a bot move if it stalls.
      this.pendingSeat = seat;
      this.renderBoard();
      this.startCountdown(() => this.resolvePending(this.botMove()));
    } else {
      // Bot seat (solo opponent, or an abandoned online seat).
      this.renderBoard();
      await this.delay(BOT_DELAY);
      if (gen !== this.gen || !this.state.isRunning) return;
      this.commitMove(this.botMove());
    }
  }

  /** Human dropped in `col`: play it (host/solo) or relay it (guest). */
  private playColumn(col: number): void {
    if (!this.awaitingHuman || this.game.current !== this.mySeat) return;
    if (this.game.columns[col].length >= ROWS) return; // full column
    this.awaitingHuman = false;
    if (this.mode === 'net' && this.net?.role === 'guest') {
      this.renderBoard();
      this.net.send(OP_MOVE, { seat: this.mySeat, col });
      return;
    }
    this.stopCountdown();
    this.commitMove({ col });
  }

  /** Host: a guest's move arrived — apply it if it is that seat's legal column. */
  private onGuestMove(seat: number | undefined, col: number | undefined): void {
    if (this.pendingSeat === null || seat !== this.pendingSeat || typeof col !== 'number') return;
    if (this.game.current !== seat || col < 0 || col >= COLS) return;
    if (this.game.columns[col].length >= ROWS) return; // legality gate
    this.resolvePending({ col });
  }

  /** Host: settle the awaited remote turn with `move` (real or auto bot move). */
  private resolvePending(move: Connect4Move): void {
    if (this.pendingSeat === null) return;
    this.pendingSeat = null;
    this.stopCountdown();
    this.commitMove(move);
  }

  /** Applies a drop, broadcasts, then ends the game or schedules the next turn. */
  private commitMove(move: Connect4Move): void {
    this.stopCountdown();
    this.game = applyMove(this.game, move);
    this.awaitingHuman = false;
    this.pendingSeat = null;
    this.updateTurnDisplay();
    this.renderBoard();
    this.animateDrop(move.col);
    this.broadcastState(move.col);

    if (this.game.winner !== null || isFull(this.game)) {
      this.clearTimer();
      // Let the winning disc land (and bounce) before the result overlay.
      this.timer = setTimeout(() => this.gameOver(), END_DELAY);
      return;
    }
    this.timer = setTimeout(() => void this.runTurn(), NEXT_TURN_DELAY);
  }

  /** Plays the falling-disc animation on the disc that just landed on top of `col`. */
  private animateDrop(col: number): void {
    const height = this.game.columns[col]?.length ?? 0;
    if (height === 0) return;
    const rowTop = ROWS - height; // the disc just placed sits at the top of the stack
    const disc = this.cellEls[col]?.[rowTop]?.querySelector<HTMLElement>('.connect4-disc');
    if (!disc) return;
    // Fall from just above the board, further for lower cells (~one cell per row).
    disc.style.setProperty('--drop-from', `${(-((rowTop + 1) / 0.88) * 100).toFixed(0)}%`);
    disc.classList.remove('is-drop');
    disc.getBoundingClientRect(); // force reflow so re-adding restarts the animation
    disc.classList.add('is-drop');
  }

  /* --- Networking (host-authoritative) ------------------------------------- */

  private broadcast(opCode: number, data: unknown): void {
    if (this.mode === 'net' && this.net?.role === 'host') this.net.send(opCode, data);
  }

  private broadcastState(dropCol?: number): void {
    this.broadcast(OP_STATE, { game: this.game, drop: dropCol ?? null });
  }

  /** Enters a relayed session: set the seat, wire messages, host runs the loop. */
  private beginNet(net: NetMatch): void {
    this.net = net;
    this.mode = 'net';
    this.mySeat = net.seat;
    this.settings?.setDisabled(true);
    net.onMessage((msg) => this.handleNetMessage(msg));
    net.onPeerLeave((seat) => this.onPeerLeave(seat));
    dismissStartOverlay();
    this.overlay.hide();
    this.stop();

    // Seats 0..players-1 are the humans (host first); the rest are bots.
    this.humanSeats = new Set(Array.from({ length: net.players }, (_, i) => i));
    this.game = initialState();
    if (net.role === 'host') {
      this.start();
    } else {
      this.state.isRunning = true;
      this.state.isGameOver = false;
      this.state.isPaused = false;
      this.gen++;
      this.updateTurnDisplay();
      this.renderBoard();
    }
  }

  /** Leaves multiplayer: back to a fresh solo game vs the bot. */
  private endNet(): void {
    this.net = null;
    this.mode = 'solo';
    this.mySeat = 0;
    this.humanSeats = new Set([0]);
    this.pendingSeat = null;
    this.settings?.setDisabled(false);
    this.stop();
    this.overlay.hide();
    this.reset();
    this.start();
  }

  /** Host-side: a seated guest left — settle any turn we were awaiting from it. */
  private onPeerLeave(seat: number): void {
    this.humanSeats.delete(seat);
    if (this.pendingSeat === seat) this.resolvePending(this.botMove());
  }

  /** Dispatches a relayed message according to this client's role. */
  private handleNetMessage(msg: MatchMessage): void {
    if (this.net?.role === 'host') {
      if (msg.opCode === OP_MOVE) {
        const d = msg.data as { seat?: number; col?: number } | null;
        if (d) this.onGuestMove(d.seat, d.col);
      }
      return;
    }
    // Guest: render whatever the authoritative host sends.
    if (msg.opCode === OP_STATE) {
      const d = msg.data as { game?: Connect4State; drop?: number | null } | null;
      if (d?.game) this.applyNetState(d.game, typeof d.drop === 'number' ? d.drop : null);
    } else if (msg.opCode === OP_TIMER) {
      const d = msg.data as { t?: number | null } | null;
      this.setTimerDisplay(d && typeof d.t === 'number' ? d.t : null);
    } else if (msg.opCode === OP_RESTART) {
      this.guestRestart();
    }
  }

  /** Guest: adopts the host's snapshot, animates the drop, then enables its turn. */
  private applyNetState(game: Connect4State, dropCol: number | null): void {
    this.game = game;
    this.updateTurnDisplay();
    const ended = game.winner !== null || isFull(game);
    this.awaitingHuman = !ended && game.current === this.mySeat;
    this.renderBoard();
    if (dropCol !== null) this.animateDrop(dropCol);
    if (ended) {
      this.clearTimer();
      this.timer = setTimeout(() => this.gameOver(), END_DELAY);
    }
  }

  /** Guest: the host called a rematch — reset and wait for fresh snapshots. */
  private guestRestart(): void {
    this.clearTimer();
    this.overlay.hide();
    this.game = initialState();
    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.awaitingHuman = false;
    this.updateTurnDisplay();
    this.renderBoard();
  }

  /** Host: starts a fresh online round (rematch). */
  private hostRematch(): void {
    this.broadcast(OP_RESTART, null);
    this.gen++;
    this.clearTimer();
    this.stopCountdown();
    this.overlay.hide();
    this.game = initialState();
    this.awaitingHuman = false;
    this.pendingSeat = null;
    this.resetState();
    this.updateTurnDisplay();
    this.renderBoard();
    this.start();
  }

  /* --- Timers -------------------------------------------------------------- */

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timer = setTimeout(resolve, ms);
    });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Shows the per-turn countdown; the host broadcasts each tick so all see it. */
  private startCountdown(onExpire: () => void): void {
    this.turnTimer.start({
      seconds: TURN_SECONDS,
      onTick: (remaining) => {
        this.setTimerDisplay(remaining);
        this.broadcast(OP_TIMER, { t: remaining });
      },
      onExpire,
    });
  }

  private stopCountdown(): void {
    this.turnTimer.stop();
    this.setTimerDisplay(null);
    this.broadcast(OP_TIMER, { t: null });
  }

  /** Paints the turn timer (the host's own ticks, or a guest's relayed value). */
  private setTimerDisplay(remaining: number | null): void {
    this.hud?.set('time', remaining === null ? null : `${remaining}s`);
    this.hud?.toggle('time', 'is-low', remaining !== null && remaining <= 5);
  }

  stop(): void {
    super.stop();
    this.gen++;
    this.clearTimer();
    this.stopCountdown();
  }

  reset(): void {
    this.gen++;
    this.clearTimer();
    this.stopCountdown();
    this.awaitingHuman = false;
    this.pendingSeat = null;
    this.game = initialState();
    this.resetState();
    this.updateTurnDisplay();
    this.renderBoard();
  }

  /* --- Game over ----------------------------------------------------------- */

  /** Solo uses the default overlay; online shows the versus result. */
  protected onGameOver(): void {
    if (this.mode === 'net') {
      this.showNetGameOver();
      return;
    }
    super.onGameOver();
  }

  protected getGameOverTitle(): string {
    if (this.game.winner === null) return "It's a draw!";
    return this.game.winner === this.mySeat ? 'You win! 🏆' : 'You lose…';
  }

  protected getGameOverContent(): string {
    if (this.game.winner === null) return '<p>The board is full — nobody lined up four.</p>';
    return this.game.winner === this.mySeat
      ? '<p>Four in a row — well played!</p>'
      : '<p>Your opponent lined up four.</p>';
  }

  /** Versus result overlay: Rematch for the host, Quit for both. */
  private showNetGameOver(): void {
    const isHost = this.net?.role === 'host';
    const draw = this.game.winner === null;
    const won = this.game.winner === this.mySeat;
    const buttons: GameOverlayButton[] = [];
    if (isHost) {
      buttons.push({
        text: 'Rematch',
        primary: true,
        onClick: () => {
          this.overlay.hide();
          this.hostRematch();
        },
      });
    }
    buttons.push({
      text: 'Quit',
      primary: !isHost,
      onClick: () => {
        this.overlay.hide();
        this.multiplayer?.leave();
      },
    });
    const waiting = !isHost ? '<p class="mp-status">Waiting for a rematch from the host…</p>' : '';
    const body = draw
      ? '<p>The board is full — nobody lined up four.</p>'
      : won
        ? '<p>Four in a row — well played!</p>'
        : '<p>Your opponent lined up four.</p>';
    this.overlay.show({
      title: draw ? "It's a draw!" : won ? 'You win! 🏆' : 'You lose…',
      bodyHtml: `${body}${waiting}`,
      buttons,
    });
  }

  // Board games are event-driven: the engine's frame loop is unused.
  update(_deltaTime: number): void {}
  render(): void {
    this.renderBoard();
  }
}
