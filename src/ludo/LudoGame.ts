import { GameEngine } from '../shared/engine/GameEngine.js';
import { dismissStartOverlay } from '../shared/ui/startOverlay.js';
import { setupSettingsPanel, SettingsPanelHandle } from '../shared/ui/settingsPanel.js';
import { createDice, DiceHandle, DiceCorner } from '../shared/ui/dice.js';
import { CountdownTimer } from '../shared/ui/countdownTimer.js';
import { setupHud } from '../shared/ui/hud.js';
import { Difficulty } from '../shared/bot/difficulty.js';
import { setupMultiplayerPanel, MultiplayerHandle } from '../shared/versus/multiplayerPanel.js';
import { NetMatch, MatchMessage } from '../shared/net/match.js';
import { GameOverlayButton } from '../shared/ui/gameOverlay.js';
import {
  LudoState,
  LudoMove,
  initialState,
  applyRoll,
  legalMoves,
  applyMove,
  passTurn,
  SEATS,
  PAWNS,
  FINISH,
} from './ludo.js';
import { decideMove } from './ludoBot.js';
import { RING_PATH, HOME_LANES, STABLES, pawnCell, GRID, Cell } from './board.js';

/** Seat colours, used in the game-over message. */
const SEAT_NAMES = ['red', 'blue', 'orange', 'green'];
/** Board corner of each seat's stable (matches the base corners in buildBoard),
 *  so the rolled die parks in the stable of whoever is playing. */
const SEAT_CORNERS: DiceCorner[] = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const SVGNS = 'http://www.w3.org/2000/svg';

/** Pacing (ms) so a human can follow the dice and the bots' moves. */
const BOT_THINK = 500;
const BOT_MOVE_DELAY = 650;
const PASS_DELAY = 750;
const NEXT_TURN_DELAY = 300;
/** Seconds the human has to act before the move is played automatically. */
const TURN_SECONDS = 10;

/** Match-state op codes exchanged over the relay (see net/match.ts, must be < 1000). */
const OP_ROLL = 1; // host → all: { value } — animate the die
const OP_STATE = 2; // host → all: { game } — authoritative board snapshot
const OP_MOVE = 3; // guest → host: { seat, pawn } — chosen move
const OP_RESTART = 4; // host → all: start a fresh round (rematch)
const OP_ROLL_REQUEST = 5; // guest → host: { seat } — "I clicked the die, roll for me"
const OP_TIMER = 6; // host → all: { t } — current turn countdown (null clears it)

/**
 * Ludo controller: drives the turn-based loop (roll → choose → apply → next),
 * playable **solo** (one human + bots) or **online for up to 4 players** over the
 * relay. It renders the cross board and handles the player clicking a horse.
 *
 * The roll is the shared animated {@link createDice} widget. It does **not** use
 * the engine's `requestAnimationFrame` loop (a board game has no continuous
 * simulation): the turn flow is an async sequence paced by timers, and a
 * generation counter cancels a stale flow on reset.
 *
 * Networking is **host-authoritative** (the natural fit for `TurnRules`): the
 * host owns the single `LudoState`, runs the loop (rolling, and playing every bot
 * / empty seat), and broadcasts the state after each change; guests render it and
 * send only their own move ({@link OP_MOVE}), which the host validates against the
 * legal moves before applying. Empty seats (and guests who leave) are filled by
 * bots, so the game always completes.
 */
export class LudoGame extends GameEngine {
  private game: LudoState = initialState();
  private difficulty: Difficulty = 'medium';

  /** 'solo' = local human (seat 0) + bots; 'net' = relayed multiplayer. */
  private mode: 'solo' | 'net' = 'solo';
  private net: NetMatch | null = null;
  private multiplayer: MultiplayerHandle | null = null;
  private settings: SettingsPanelHandle | null = null;
  /** This client's seat (0 in solo / for the host). */
  private mySeat = 0;
  /** Host-side: seats driven by a human (the rest are bots). */
  private humanSeats = new Set<number>([0]);
  /** Host-side: the seat whose network move we are awaiting, or null. */
  private pendingSeat: number | null = null;
  /** Host-side: the remote roll we are awaiting (its seat + settle callback). */
  private pendingRoll: { seat: number; resolve: () => void } | null = null;
  /** Host-side: a roll request that arrived before we started waiting (fast click). */
  private bufferedRollSeat: number | null = null;
  /** Guest-side: bumped on every snapshot to cancel a stale die-roll prompt. */
  private guestRollGen = 0;

  private boardEl: HTMLElement | null = null;
  private playersEl: HTMLElement | null = null;
  private dice: DiceHandle | null = null;
  /** The four player badges, indexed by seat. */
  private playerEls: HTMLElement[] = [];
  /** The faint seat label inside each base, indexed by seat. */
  private baseNumEls: HTMLElement[] = [];
  /** `pawnEls[seat][pawn]` — the DOM token of each horse. */
  private pawnEls: HTMLElement[][] = [];

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The per-turn countdown (human only); auto-plays the move at zero. */
  private readonly turnTimer = new CountdownTimer();
  /** Bumped on every (re)start/reset to abandon any in-flight async turn. */
  private gen = 0;
  /** True while waiting for the local human to click one of {@link humanMoves}. */
  private awaitingHuman = false;
  private humanMoves: LudoMove[] = [];

  constructor() {
    super({ storageKey: 'ludo' });
  }

  initialize(): void {
    this.boardEl = document.getElementById('board');
    this.playersEl = document.getElementById('ludoPlayers');
    this.hud = setupHud([{ key: 'time', icon: 'clock', label: 'Time' }]);

    this.buildBoard();
    this.buildPlayers();
    if (this.boardEl) this.dice = createDice(this.boardEl);

    this.settings = setupSettingsPanel([
      {
        id: 'difficulty',
        label: 'Bots',
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
    this.renderBoard();
  }

  /** Builds the static board (bases, centre triangles, cells, slots, tokens). */
  private buildBoard(): void {
    const board = this.boardEl;
    if (!board) return;
    board.innerHTML = '';

    const div = (className: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.className = className;
      return el;
    };

    // Four corner bases, each labelled with its player number.
    const baseCorners: Cell[] = [
      [0, 0],
      [0, 9],
      [9, 9],
      [9, 0],
    ];
    this.baseNumEls = [];
    baseCorners.forEach((corner, seat) => {
      const base = div(`ludo-base ludo-base--s${seat}`);
      this.place(base, corner, 6, 6);
      const num = document.createElement('span');
      num.className = 'ludo-base-num';
      num.textContent = this.seatLabel(seat);
      num.style.color = `var(--ludo-seat-${seat})`;
      base.appendChild(num);
      board.append(base);
      this.baseNumEls[seat] = num;
    });

    // Centre cut into four coloured triangles ("arrows"), each facing the lane
    // of its colour; finished horses gather in their own triangle.
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'ludo-center');
    this.place(svg, [6, 6], 3, 3);
    const triangles: [string, number][] = [
      ['0,0 0,100 50,50', 0], // left  → seat 0
      ['0,0 100,0 50,50', 1], // top   → seat 1
      ['100,0 100,100 50,50', 2], // right → seat 2
      ['0,100 100,100 50,50', 3], // bottom → seat 3
    ];
    for (const [points, seat] of triangles) {
      const poly = document.createElementNS(SVGNS, 'polygon');
      poly.setAttribute('points', points);
      poly.setAttribute('class', `ludo-center-tri ludo-center-tri--s${seat}`);
      svg.appendChild(poly);
    }
    board.append(svg);

    // Ring cells (a seat's start cell every 13 steps gets its colour).
    RING_PATH.forEach((cell, i) => {
      const start = i % 13 === 0;
      const cls = start ? `ludo-cell ludo-cell--start ludo-cell--s${i / 13}` : 'ludo-cell';
      const el = div(cls);
      this.place(el, cell);
      board.append(el);
    });
    // Private home-lane cells.
    HOME_LANES.forEach((lane, seat) => {
      for (const cell of lane) {
        const el = div(`ludo-cell ludo-cell--home ludo-cell--s${seat}`);
        this.place(el, cell);
        board.append(el);
      }
    });
    // Stable slots inside each base.
    STABLES.forEach((slots, seat) => {
      for (const cell of slots) {
        const el = div(`ludo-slot ludo-slot--s${seat}`);
        this.place(el, cell);
        board.append(el);
      }
    });

    // The 16 horse tokens (clickable when it is the player's turn).
    this.pawnEls = [];
    for (let seat = 0; seat < SEATS; seat++) {
      const row: HTMLElement[] = [];
      for (let pawn = 0; pawn < PAWNS; pawn++) {
        const el = div(`ludo-pawn ludo-pawn--s${seat}`);
        el.addEventListener('click', () => this.onPawnClick(seat, pawn));
        board.append(el);
        row.push(el);
      }
      this.pawnEls.push(row);
    }
  }

  /** Positions an element on the grid (top-left cell + optional cell span), in %. */
  private place(el: HTMLElement | SVGElement, cell: Cell, rows = 1, cols = 1): void {
    const size = 100 / GRID;
    el.style.top = `${cell[0] * size}%`;
    el.style.left = `${cell[1] * size}%`;
    el.style.width = `${cols * size}%`;
    el.style.height = `${rows * size}%`;
  }

  /** Builds the four coloured, compactly-labelled player badges (see seatLabel). */
  private buildPlayers(): void {
    if (!this.playersEl) return;
    this.playersEl.innerHTML = '';
    this.playerEls = [];
    for (let seat = 0; seat < SEATS; seat++) {
      const chip = document.createElement('span');
      chip.className = 'ludo-player';
      chip.style.setProperty('--seat-color', `var(--ludo-seat-${seat})`);
      const dot = document.createElement('span');
      dot.className = 'ludo-player-dot';
      const label = document.createElement('span');
      label.textContent = this.seatLabel(seat) + (seat === this.mySeat ? ' (you)' : '');
      chip.append(dot, label);
      this.playersEl.append(chip);
      this.playerEls.push(chip);
    }
    this.updateBaseLabels();
  }

  /** Refreshes the faint seat label shown inside each base. */
  private updateBaseLabels(): void {
    for (let seat = 0; seat < SEATS; seat++) {
      const el = this.baseNumEls[seat];
      if (el) el.textContent = this.seatLabel(seat);
    }
  }

  /**
   * Short label for a seat, kept compact (used by both the top-bar badges and the
   * in-base tag): "P1"…"P4" for humans, "bot1"…"botN" for the bot-filled seats.
   * The badge appends "(you)" for the local seat. Once Google sign-in carries
   * player names, the human branch can return the player's name instead of "P{n}".
   */
  private seatLabel(seat: number): string {
    if (this.humanSeats.has(seat)) return `P${seat + 1}`;
    return `Bot ${seat - this.humanSeats.size + 1}`;
  }

  /** Moves the horse tokens to match the state, and refreshes the status line. */
  private renderBoard(): void {
    const size = 100 / GRID;
    const pawnSize = size * 0.66;
    for (let seat = 0; seat < SEATS; seat++) {
      for (let pawn = 0; pawn < PAWNS; pawn++) {
        const el = this.pawnEls[seat]?.[pawn];
        if (!el) continue;
        const pos = this.pawnPosition(seat, pawn, size, pawnSize);
        el.style.top = `${pos.top}%`;
        el.style.left = `${pos.left}%`;
        el.style.width = `${pawnSize}%`;
        el.style.height = `${pawnSize}%`;
        const movable =
          this.awaitingHuman && seat === this.mySeat && this.humanMoves.some((m) => m.pawn === pawn);
        el.classList.toggle('is-movable', movable);
      }
    }

    for (let seat = 0; seat < SEATS; seat++) {
      const active = this.game.winner === null && this.game.current === seat;
      this.playerEls[seat]?.classList.toggle('is-active', active);
    }
  }

  /** Top-left (%) of a horse token, arranging finished horses in their triangle. */
  private pawnPosition(
    seat: number,
    pawn: number,
    size: number,
    pawnSize: number
  ): { top: number; left: number } {
    const d = this.game.pawns[seat][pawn];
    if (d === FINISH) {
      // Anchor near the outer middle of the seat's centre triangle, 2×2 cluster.
      const top0 = 6 * size;
      const left0 = 6 * size;
      const anchors = [
        { x: left0 + 0.55 * size, y: top0 + 1.5 * size }, // seat 0 (left)
        { x: left0 + 1.5 * size, y: top0 + 0.55 * size }, // seat 1 (top)
        { x: left0 + 2.45 * size, y: top0 + 1.5 * size }, // seat 2 (right)
        { x: left0 + 1.5 * size, y: top0 + 2.45 * size }, // seat 3 (bottom)
      ];
      const a = anchors[seat];
      const dx = ((pawn % 2) - 0.5) * 0.62 * size;
      const dy = (Math.floor(pawn / 2) - 0.5) * 0.62 * size;
      return { top: a.y + dy - pawnSize / 2, left: a.x + dx - pawnSize / 2 };
    }
    const cell = pawnCell(seat, pawn, d);
    return {
      top: cell[0] * size + (size - pawnSize) / 2,
      left: cell[1] * size + (size - pawnSize) / 2,
    };
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

  /**
   * One full turn (host/solo authority): roll (clicked by the local human, auto
   * for everyone else), then act — local human, remote guest, or bot.
   */
  private async runTurn(): Promise<void> {
    const gen = this.gen;
    if (!this.state.isRunning) return;
    this.awaitingHuman = false;
    this.humanMoves = [];
    this.pendingSeat = null;
    this.dice?.hide();
    this.renderBoard();

    const seat = this.game.current;
    this.setDiceAccent();
    if (seat === this.mySeat) {
      // Local human: click the die to roll (or auto-roll at the countdown's end).
      await this.humanTimed(this.dice?.awaitRoll() ?? Promise.resolve());
    } else if (this.isRemoteHuman(seat)) {
      // Remote human: wait for its die click; auto-roll if it stalls/leaves.
      await this.awaitRemoteRoll(seat);
    } else {
      // Bot seat: rolls automatically.
      await this.delay(BOT_THINK);
    }
    if (gen !== this.gen || !this.state.isRunning) return;

    const value = 1 + Math.floor(Math.random() * 6);
    this.game = applyRoll(this.game, value);
    this.broadcast(OP_ROLL, { value });
    await this.dice?.show(value);
    if (gen !== this.gen || !this.state.isRunning) return;
    this.broadcastState();

    const moves = legalMoves(this.game);
    if (moves.length === 0) {
      await this.delay(PASS_DELAY);
      if (gen !== this.gen || !this.state.isRunning) return;
      this.game = passTurn(this.game);
      this.broadcastState();
      void this.runTurn();
      return;
    }

    if (seat === this.mySeat) {
      // Local human: click a horse, or auto-play at the countdown's end.
      this.parkDice();
      this.awaitingHuman = true;
      this.humanMoves = moves;
      this.renderBoard();
      this.startCountdown(() => {
        if (this.awaitingHuman) this.commitMove(decideMove(this.game, this.humanMoves, this.difficulty));
      });
    } else if (this.isRemoteHuman(seat)) {
      // Remote guest: wait for its OP_MOVE, auto-play a bot move if it stalls/leaves.
      this.parkDice();
      this.pendingSeat = seat;
      this.humanMoves = moves;
      this.startCountdown(() => this.resolvePending(decideMove(this.game, moves, this.difficulty)));
    } else {
      // Bot seat (solo opponents, or an empty/abandoned online seat).
      await this.delay(BOT_MOVE_DELAY);
      if (gen !== this.gen || !this.state.isRunning) return;
      this.commitMove(decideMove(this.game, moves, this.difficulty));
    }
  }

  /** Player clicked a horse: play it (host/solo) or send it (guest). */
  private onPawnClick(seat: number, pawn: number): void {
    if (!this.awaitingHuman || seat !== this.mySeat) return;
    if (!this.humanMoves.some((m) => m.pawn === pawn)) return;
    this.awaitingHuman = false;
    if (this.mode === 'net' && this.net?.role === 'guest') {
      // Guest: relay the move; the authoritative host applies and broadcasts it.
      this.renderBoard();
      this.net.send(OP_MOVE, { seat: this.mySeat, pawn });
      return;
    }
    this.stopCountdown();
    this.commitMove({ pawn });
  }

  /** Host: a guest's move arrived — apply it if it is that seat's legal move. */
  private onGuestMove(seat: number | undefined, pawn: number | undefined): void {
    if (this.pendingSeat === null || seat !== this.pendingSeat || typeof pawn !== 'number') return;
    if (this.game.current !== seat) return;
    if (!this.humanMoves.some((m) => m.pawn === pawn)) return; // legality gate
    this.resolvePending({ pawn });
  }

  /** Host: settle the awaited remote turn with `move` (real or auto bot move). */
  private resolvePending(move: LudoMove): void {
    if (this.pendingSeat === null) return;
    this.pendingSeat = null;
    this.stopCountdown();
    this.commitMove(move);
  }

  /**
   * Host: waits for a remote seat to click its die ({@link OP_ROLL_REQUEST}); a
   * countdown auto-rolls so an idle or vanished guest never hangs the game.
   * The state snapshot sent at the end of the previous turn already told the guest
   * it is its turn to roll (current seat, no die yet), so it shows the prompt.
   */
  private awaitRemoteRoll(seat: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.pendingRoll = null;
        this.stopCountdown();
        resolve();
      };
      // The guest may have clicked before we got here (300 ms turn gap): honour it.
      if (this.bufferedRollSeat === seat) {
        this.bufferedRollSeat = null;
        finish();
        return;
      }
      this.pendingRoll = { seat, resolve: finish };
      this.startCountdown(finish);
    });
  }

  /** Host: a guest clicked its die — let the authoritative roll proceed. */
  private onGuestRollRequest(seat: number | undefined): void {
    if (typeof seat !== 'number') return;
    // Only valid at this seat's pre-roll moment (its turn, no die yet).
    if (this.game.current !== seat || this.game.die !== null) return;
    if (this.pendingRoll?.seat === seat) this.pendingRoll.resolve();
    else this.bufferedRollSeat = seat; // arrived early — consumed by awaitRemoteRoll
  }

  /** Applies a move, broadcasts, then ends the game or schedules the next turn. */
  private commitMove(move: LudoMove): void {
    this.stopCountdown();
    this.dice?.hide();
    this.game = applyMove(this.game, move);
    this.awaitingHuman = false;
    this.humanMoves = [];
    this.pendingSeat = null;
    this.renderBoard();
    this.broadcastState();

    if (this.game.winner !== null) {
      this.clearTimer();
      this.gameOver();
      return;
    }
    this.timer = setTimeout(() => void this.runTurn(), NEXT_TURN_DELAY);
  }

  /* --- Networking (host-authoritative) ------------------------------------- */

  /** Host only: sends a payload to the guests (no-op in solo / on a guest). */
  private broadcast(opCode: number, data: unknown): void {
    if (this.mode === 'net' && this.net?.role === 'host') this.net.send(opCode, data);
  }

  /** Host only: broadcasts the authoritative board snapshot. */
  private broadcastState(): void {
    this.broadcast(OP_STATE, { game: this.game });
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

    // Seats 0..players-1 are the seated humans (host first), the rest are bots.
    this.humanSeats = new Set(Array.from({ length: net.players }, (_, i) => i));
    this.buildPlayers();

    this.game = initialState();
    if (net.role === 'host') {
      this.start();
    } else {
      // Guest: render-only, driven by the host's snapshots.
      this.state.isRunning = true;
      this.state.isGameOver = false;
      this.state.isPaused = false;
      this.gen++;
      this.renderBoard();
    }
  }

  /** Leaves multiplayer: back to a fresh solo game vs bots. */
  private endNet(): void {
    this.net = null;
    this.mode = 'solo';
    this.mySeat = 0;
    this.humanSeats = new Set([0]);
    this.pendingSeat = null;
    this.settings?.setDisabled(false);
    this.stop();
    this.overlay.hide();
    this.buildPlayers();
    this.reset();
    this.start();
  }

  /** Host-side: a seated guest left — its seat becomes a bot from now on. */
  private onPeerLeave(seat: number): void {
    this.humanSeats.delete(seat);
    // If we were waiting on that seat, settle its turn right away (now a bot):
    // an awaited roll just proceeds (auto-roll), an awaited move plays a bot move.
    if (this.pendingRoll?.seat === seat) this.pendingRoll.resolve();
    if (this.pendingSeat === seat) this.resolvePending(decideMove(this.game, this.humanMoves, this.difficulty));
  }

  /** Dispatches a relayed message according to this client's role. */
  private handleNetMessage(msg: MatchMessage): void {
    if (this.net?.role === 'host') {
      if (msg.opCode === OP_MOVE) {
        const d = msg.data as { seat?: number; pawn?: number } | null;
        if (d) this.onGuestMove(d.seat, d.pawn);
      } else if (msg.opCode === OP_ROLL_REQUEST) {
        const d = msg.data as { seat?: number } | null;
        this.onGuestRollRequest(d?.seat);
      }
      return;
    }
    // Guest: render whatever the authoritative host sends.
    if (msg.opCode === OP_ROLL) {
      const d = msg.data as { value?: number } | null;
      if (d?.value) void this.dice?.show(d.value);
    } else if (msg.opCode === OP_STATE) {
      const d = msg.data as { game?: LudoState } | null;
      if (d?.game) this.applyNetState(d.game);
    } else if (msg.opCode === OP_TIMER) {
      const d = msg.data as { t?: number | null } | null;
      this.setTimerDisplay(d && typeof d.t === 'number' ? d.t : null);
    } else if (msg.opCode === OP_RESTART) {
      this.guestRestart();
    }
  }

  /**
   * Guest: adopts the host's snapshot, then drives its own turn — prompt the die
   * when it is up and hasn't rolled yet, or highlight movable horses once it has.
   */
  private applyNetState(game: LudoState): void {
    this.game = game;
    this.setDiceAccent();
    // Any new snapshot cancels a pending (stale) die-roll prompt.
    this.guestRollGen++;

    if (game.winner !== null) {
      this.awaitingHuman = false;
      this.humanMoves = [];
      this.dice?.hide();
      this.renderBoard();
      this.gameOver();
      return;
    }

    const myTurn = game.current === this.mySeat;
    if (myTurn && game.die === null) {
      // My turn to roll: show the clickable die (its click relays a roll request).
      this.awaitingHuman = false;
      this.humanMoves = [];
      this.renderBoard();
      this.promptGuestRoll();
      return;
    }
    if (myTurn) {
      // My turn to move: the die is rolled, highlight the horses I can play.
      this.awaitingHuman = true;
      this.humanMoves = legalMoves(game);
      this.parkDice();
      this.renderBoard();
      return;
    }
    // Someone else's turn: keep a rolled die visible, otherwise hide it.
    this.awaitingHuman = false;
    this.humanMoves = [];
    if (game.die !== null) this.parkDice();
    else this.dice?.hide();
    this.renderBoard();
  }

  /** Guest: show the die prompt; clicking it asks the host to roll for this seat. */
  private promptGuestRoll(): void {
    const gen = this.guestRollGen;
    void (this.dice?.awaitRoll() ?? Promise.resolve()).then(() => {
      if (gen !== this.guestRollGen || this.mode !== 'net') return;
      this.net?.send(OP_ROLL_REQUEST, { seat: this.mySeat });
    });
  }

  /** Guest: the host called a rematch — reset and wait for fresh snapshots. */
  private guestRestart(): void {
    this.overlay.hide();
    this.guestRollGen++;
    this.game = initialState();
    this.state.isRunning = true;
    this.state.isGameOver = false;
    this.awaitingHuman = false;
    this.humanMoves = [];
    this.dice?.hide();
    this.renderBoard();
  }

  /** Host: starts a fresh online round (rematch). */
  private hostRematch(): void {
    this.broadcast(OP_RESTART, null);
    this.gen++;
    this.clearTimer();
    this.stopCountdown();
    this.pendingRoll?.resolve();
    this.bufferedRollSeat = null;
    this.dice?.hide();
    this.overlay.hide();
    this.game = initialState();
    this.awaitingHuman = false;
    this.humanMoves = [];
    this.pendingSeat = null;
    this.resetState();
    this.renderBoard();
    this.start();
  }

  /* --- Timers -------------------------------------------------------------- */

  /** Promise that resolves after `ms`, cancellable via {@link clearTimer}. */
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

  /** Resolves when `action` (the human's click) settles OR the timer fires. */
  private humanTimed(action: Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.stopCountdown();
        resolve();
      };
      void action.then(finish);
      this.startCountdown(finish);
    });
  }

  /** Parks the die into the stable of the seat currently playing. */
  private parkDice(): void {
    this.dice?.park(SEAT_CORNERS[this.game.current]);
  }

  /** Tints the die's outline with the colour of the seat currently playing. */
  private setDiceAccent(): void {
    this.dice?.setAccent(`var(--ludo-seat-${this.game.current})`);
  }

  /** Shows the per-turn countdown; calls `onExpire` if it reaches zero. The
   *  host broadcasts each tick so every client sees the same live timer. */
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
    this.pendingRoll?.resolve();
    this.bufferedRollSeat = null;
  }

  reset(): void {
    this.gen++;
    this.clearTimer();
    this.stopCountdown();
    this.pendingRoll?.resolve();
    this.bufferedRollSeat = null;
    this.guestRollGen++;
    this.dice?.hide();
    this.awaitingHuman = false;
    this.humanMoves = [];
    this.pendingSeat = null;
    this.game = initialState();
    this.resetState();
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
    return this.game.winner === this.mySeat ? 'You win! 🏆' : 'You lose…';
  }

  protected getGameOverContent(): string {
    const w = this.game.winner ?? 0;
    return w === this.mySeat
      ? '<p>Well done, your 4 horses are home in the center!</p>'
      : `<p>Player ${SEAT_NAMES[w]} brought all 4 horses home.</p>`;
  }

  /** Versus result overlay: Rematch for the host, Quit for everyone. */
  private showNetGameOver(): void {
    const won = this.game.winner === this.mySeat;
    const isHost = this.net?.role === 'host';
    const w = this.game.winner ?? 0;
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
    const waiting = !isHost
      ? '<p class="mp-status">Waiting for a rematch from the host…</p>'
      : '';
    const body = won
      ? '<p>Your 4 horses are home in the center!</p>'
      : `<p>Player ${SEAT_NAMES[w]} won.</p>`;
    this.overlay.show({
      title: won ? 'You win! 🏆' : 'You lose…',
      bodyHtml: `${body}${waiting}`,
      buttons,
    });
  }

  // Board games are event-driven: the engine's frame loop is unused.
  update(_deltaTime: number): void {}
  render(): void {
    this.renderBoard();
  }
  handleInput(_event: KeyboardEvent): void {}
}
