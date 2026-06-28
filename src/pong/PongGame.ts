import { GameEngine, GameConfig } from '../shared/engine/GameEngine.js';
import { setupPaddlePointer } from '../shared/engine/pointerControl.js';
import { Difficulty } from '../shared/bot/difficulty.js';
import { pongBotTargetY } from '../shared/bot/pongBot.js';
import { VersusRole } from '../shared/versus/opponent.js';
import { setupSettingsPanel, SettingsPanelHandle } from '../shared/ui/settingsPanel.js';
import { setupMultiplayerPanel, MultiplayerHandle } from '../shared/versus/multiplayerPanel.js';
import { NetMatch, MatchMessage } from '../shared/net/match.js';
import { runCountdown } from '../shared/ui/countdown.js';
import { GameOverlayButton } from '../shared/ui/gameOverlay.js';

/**
 * The ball, in logical board coordinates (square 0–100). `vx`/`vy` are in units
 * per millisecond.
 */
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/* --- Logical board geometry (100×100 square) --- */
const BOARD = 100;
const BALL_R = 1.8;
/** Paddle height (length) and thickness. */
const PADDLE_H = 18;
const PADDLE_T = 2.4;
/** Fixed x center of each paddle (player left, opponent right). */
const PLAYER_X = 4;
const OPPONENT_X = BOARD - 4;

/** Ball base speed and per-hit acceleration (units/ms), capped. The ball ramps
 * up fast so rallies actually end (no endless, unwinnable exchange). */
const BASE_SPEED = 0.05;
const SPEED_PER_HIT = 1.08;
const MAX_SPEED = 0.18;
/** Paddle travel speed for the player and the bot (units/ms). Both are kept below
 * the ball's max vertical speed so a fast, steep shot can beat either of them —
 * the game stays winnable AND losable even against a perfect bot. */
const PLAYER_SPEED = 0.115;
const BOT_SPEED = 0.092;
/** Maximum return angle off a paddle edge (radians). */
const MAX_BOUNCE_ANGLE = (50 * Math.PI) / 180;
/** Pause (ms) before the ball is served after a point / at kickoff. */
const SERVE_DELAY = 800;
/** Beat (ms) between the winning point and the result overlay, so the final
 *  score is visible on the scoreboard before the victory panel appears. */
const END_DELAY = 800;

/** Available win-score choices for the Paramètres panel. */
const WIN_SCORES = [3, 5, 11];
const DEFAULT_WIN_SCORE = 5;

/** Match-state op codes exchanged over the relay (see net/match.ts). */
const OP_INPUT = 1; // guest → host: { y } guest paddle center
const OP_STATE = 2; // host → guest: authoritative snapshot
const OP_END = 3; // host → guest: match finished
const OP_RESTART = 4; // host → guest: rematch, restart now
/** How often (ms) the host broadcasts state / the guest sends its input (~25 Hz). */
const NET_SEND_MS = 40;

/** Authoritative snapshot the host broadcasts (host = left paddle). */
interface HostState {
  bx: number; // ball x
  by: number; // ball y
  bvx: number; // ball velocity x (for guest extrapolation)
  bvy: number; // ball velocity y
  hy: number; // host paddle y (left)
  hs: number; // host score
  gs: number; // guest score
  sv: boolean; // serving (ball frozen at center)
}

/** Guest correction strength applied to the ball on each snapshot (0–1): low
 *  enough to absorb network jitter, high enough to stay in sync. */
const NET_CORRECT = 0.5;

/**
 * Pong — the first versus game (1-v-1).
 *
 * Two vertical paddles, a ball bouncing between them; first to {@link winScore}
 * points wins. The player drives the left paddle (↑/↓ or Z/S, or drag/mouse on
 * the board); the right paddle is the opponent. In `solo` it is a bot whose skill
 * is tuned in the Paramètres panel; in multiplayer it is the remote player, with
 * the host simulating the ball authoritatively.
 *
 * Reuses the engine's `requestAnimationFrame` loop: the ball advances in small
 * sub-steps proportional to `deltaTime` so collisions stay reliable at speed
 * (same approach as {@link BreakoutGame}).
 */
export class PongGame extends GameEngine {
  /** Who drives the opponent / who is authoritative (see {@link VersusRole}). */
  protected role: VersusRole = 'solo';
  /** Bot difficulty (solo / host-side fill-in), set from the Paramètres panel. */
  private difficulty: Difficulty = 'medium';
  /** Points needed to win the match. */
  private winScore = DEFAULT_WIN_SCORE;

  private ball: Ball = { x: 50, y: 50, vx: 0, vy: 0 };
  /** Paddle y centers. */
  private playerY = BOARD / 2;
  private opponentY = BOARD / 2;
  /** Player score is the engine's `state.score`; the opponent's is tracked here. */
  private opponentScore = 0;
  private speed = BASE_SPEED;
  /** Countdown (ms) before the next serve; the ball is frozen while > 0. */
  private serveTimer = SERVE_DELAY;

  /** Movement keys held down by the player. */
  private readonly keys = { up: false, down: false };

  /** Live relayed match in multiplayer (null in solo). */
  private net: NetMatch | null = null;
  /** Handle to the multiplayer panel (to leave from the game-over overlay). */
  private multiplayer: MultiplayerHandle | null = null;
  /** Handle to the settings panel (disabled while in a session). */
  private settings: SettingsPanelHandle | null = null;
  /** Latest guest paddle target received by the host (host applies it, capped). */
  private guestTargetY = BOARD / 2;
  /** Guest-side target for the opponent (host) paddle, smoothed each frame. */
  private opponentTargetY = BOARD / 2;
  /** Guest-side flag: the host is serving, so the guest freezes the ball. */
  private guestServing = false;
  /** Throttle accumulator for network sends (ms). */
  private netSendAcc = 0;

  private boardElement: HTMLElement | null = null;
  private ballElement: HTMLElement | null = null;
  private playerPaddleEl: HTMLElement | null = null;
  private opponentPaddleEl: HTMLElement | null = null;
  private scoreElement: HTMLElement | null = null;
  private opponentScoreElement: HTMLElement | null = null;

  constructor(config: GameConfig = {}) {
    super({ ...config, storageKey: 'pong' });
  }

  /**
   * Binds the DOM, builds the board, wires controls + the Paramètres panel, then
   * performs the first render and arms the kickoff serve.
   */
  initialize(): void {
    this.boardElement = document.getElementById('board');
    this.scoreElement = document.querySelector('.score');
    this.opponentScoreElement = document.querySelector('.opp-score');

    this.buildBoard();
    this.setupEventListeners();
    this.setupSettings();
    this.multiplayer = setupMultiplayerPanel({
      onSessionStart: (net) => this.beginVersus(net),
      onSessionEnd: () => this.endVersus(),
    });
    this.resetBall(true);
    this.updateScoreDisplay();
    this.render();
  }

  /**
   * Player controls: hold ↑/↓ or Z/S (continuous movement applied in
   * {@link update}) and drag/mouse on the board. Overrides the engine's one-shot
   * keyboard listening.
   */
  protected setupEventListeners(): void {
    document.addEventListener('keydown', (e) => this.setKey(e, true));
    document.addEventListener('keyup', (e) => this.setKey(e, false));
    if (this.boardElement) {
      setupPaddlePointer({
        board: this.boardElement,
        axis: 'y',
        onMove: (ratio) => {
          this.playerY = this.clampPaddle(ratio * BOARD);
        },
        getRatio: () => this.playerY / BOARD,
      });
    }
  }

  /** Builds the Paramètres panel (bot difficulty + win score). No-op without markup. */
  private setupSettings(): void {
    this.settings = setupSettingsPanel([
      {
        id: 'difficulty',
        label: 'Bot',
        value: this.difficulty,
        choices: [
          { label: 'Facile', value: 'easy' },
          { label: 'Moyen', value: 'medium' },
          { label: 'Difficile', value: 'hard' },
        ],
        onChange: (value) => {
          this.difficulty = value as Difficulty;
        },
      },
      {
        id: 'winScore',
        label: 'Manche',
        value: String(this.winScore),
        choices: WIN_SCORES.map((n) => ({ label: `${n} pts`, value: String(n) })),
        onChange: (value) => {
          this.winScore = Number(value);
          this.reset();
          // Only relaunch a running match; otherwise keep the Play screen
          // (changing a setting must NOT start the game).
          if (this.state.isRunning) this.start();
        },
      },
    ]);
  }

  /** Tracks a held movement key (and stops the arrows from scrolling the page). */
  private setKey(event: KeyboardEvent, pressed: boolean): void {
    if (this.isFormFieldTarget(event.target)) return;
    if (event.code === 'ArrowUp' || event.code === 'KeyW' || event.code === 'KeyZ') {
      this.keys.up = pressed;
      event.preventDefault();
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      this.keys.down = pressed;
      event.preventDefault();
    }
  }

  /** Required by the engine; movement is continuous (held keys), handled in update. */
  handleInput(_event: KeyboardEvent): void {}

  /**
   * Advances the match a frame: player paddle, opponent paddle, then the ball
   * (unless a serve countdown is running, or this client is a non-authoritative
   * guest, which only predicts the ball between the host's snapshots).
   */
  update(deltaTime: number): void {
    if (this.state.isPaused || this.state.isGameOver) return;
    const dt = Math.min(deltaTime, 32);

    this.movePlayer(dt);

    // Guest: send its paddle, then PREDICT locally (extrapolate the ball + bounce
    // off walls/paddles, smooth the opponent paddle) so motion is fluid at 60 fps
    // between the host's ~25 Hz snapshots. Each snapshot gently corrects any drift.
    if (this.role === 'guest') {
      this.sendGuestInput(dt);
      this.opponentY = this.approach(this.opponentY, this.opponentTargetY, PLAYER_SPEED * dt);
      if (!this.guestServing) this.stepBall(dt, false);
      return;
    }

    this.moveOpponent(dt);

    if (this.serveTimer > 0) {
      this.serveTimer -= dt;
    } else {
      this.stepBall(dt, true);
    }
    this.maybeBroadcastState(dt);
  }

  /** Moves the player's paddle from the held keys, clamped to the board. */
  private movePlayer(dt: number): void {
    let dir = 0;
    if (this.keys.up) dir -= 1;
    if (this.keys.down) dir += 1;
    if (dir !== 0) this.playerY = this.clampPaddle(this.playerY + dir * PLAYER_SPEED * dt);
  }

  /**
   * Moves the opponent paddle. In `host` it tracks the guest's last input,
   * capped at the human paddle speed so a tampered guest can't teleport
   * (relayed-mode anti-cheat). In `solo` it follows the bot's target.
   */
  private moveOpponent(dt: number): void {
    let target: number;
    let speed: number;
    if (this.role === 'host') {
      target = this.guestTargetY;
      speed = PLAYER_SPEED;
    } else {
      target = pongBotTargetY(
        {
          ballX: this.ball.x,
          ballY: this.ball.y,
          ballVx: this.ball.vx,
          ballVy: this.ball.vy,
          paddleX: OPPONENT_X,
          boardSize: BOARD,
        },
        this.difficulty
      );
      speed = BOT_SPEED;
    }
    this.opponentY = this.approach(this.opponentY, target, speed * dt);
  }

  /** Moves a value toward a target by at most `maxStep`. */
  private approach(value: number, target: number, maxStep: number): number {
    const delta = target - value;
    if (Math.abs(delta) <= maxStep) return this.clampPaddle(target);
    return this.clampPaddle(value + Math.sign(delta) * maxStep);
  }

  /** Clamps a paddle center so the whole paddle stays on the board. */
  private clampPaddle(y: number): number {
    return Math.max(PADDLE_H / 2, Math.min(BOARD - PADDLE_H / 2, y));
  }

  /**
   * Advances the ball in sub-steps (≤ one radius each), bouncing off the top/
   * bottom walls and the paddles, and awarding a point when it exits a side.
   */
  private stepBall(dt: number, allowScore: boolean): void {
    const distance = Math.max(Math.abs(this.ball.vx), Math.abs(this.ball.vy)) * dt;
    const steps = Math.max(1, Math.ceil(distance / BALL_R));
    const stepDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.ball.x += this.ball.vx * stepDt;
      this.ball.y += this.ball.vy * stepDt;

      this.collideWalls();
      this.collidePaddles();

      // Only the authoritative side (host/solo) turns an exit into a point; the
      // guest just predicts and waits for the host's correction.
      if (this.ball.x < -BALL_R) {
        if (allowScore) this.concede(/* opponent scores */ false);
        return;
      }
      if (this.ball.x > BOARD + BALL_R) {
        if (allowScore) this.concede(/* player scores */ true);
        return;
      }
    }
  }

  /** Bounces the ball off the top and bottom walls. */
  private collideWalls(): void {
    if (this.ball.y - BALL_R <= 0) {
      this.ball.y = BALL_R;
      this.ball.vy = Math.abs(this.ball.vy);
    } else if (this.ball.y + BALL_R >= BOARD) {
      this.ball.y = BOARD - BALL_R;
      this.ball.vy = -Math.abs(this.ball.vy);
    }
  }

  /** Bounces the ball off whichever paddle it is overlapping, angle by impact. */
  private collidePaddles(): void {
    // Player paddle (left), only while the ball travels left.
    if (this.ball.vx < 0 && this.hitsPaddle(PLAYER_X, this.playerY)) {
      this.bounceOffPaddle(this.playerY, 1);
      this.ball.x = PLAYER_X + PADDLE_T / 2 + BALL_R;
    } else if (this.ball.vx > 0 && this.hitsPaddle(OPPONENT_X, this.opponentY)) {
      // Opponent paddle (right), only while the ball travels right.
      this.bounceOffPaddle(this.opponentY, -1);
      this.ball.x = OPPONENT_X - PADDLE_T / 2 - BALL_R;
    }
  }

  /** Whether the ball overlaps the paddle centered at (paddleX, paddleY). */
  private hitsPaddle(paddleX: number, paddleY: number): boolean {
    const withinX = Math.abs(this.ball.x - paddleX) <= PADDLE_T / 2 + BALL_R;
    const withinY = Math.abs(this.ball.y - paddleY) <= PADDLE_H / 2 + BALL_R;
    return withinX && withinY;
  }

  /**
   * Reflects the ball off a paddle: the return angle grows with the distance from
   * the paddle center (edges = steep), and the ball speeds up a little, capped.
   * @param dirX +1 to send the ball rightward, -1 leftward.
   */
  private bounceOffPaddle(paddleY: number, dirX: number): void {
    const offset = (this.ball.y - paddleY) / (PADDLE_H / 2); // -1..1
    const angle = Math.max(-1, Math.min(1, offset)) * MAX_BOUNCE_ANGLE;
    this.speed = Math.min(MAX_SPEED, this.speed * SPEED_PER_HIT);
    this.ball.vx = dirX * this.speed * Math.cos(angle);
    this.ball.vy = this.speed * Math.sin(angle);
  }

  /**
   * Awards the point, refreshes the display and either ends the match (a player
   * reached {@link winScore}) or arms the next serve toward the conceding side.
   * @param toPlayer true when the player scored (ball exited the opponent side).
   */
  private concede(toPlayer: boolean): void {
    if (toPlayer) this.addScore(1);
    else this.opponentScore += 1;
    this.updateScoreDisplay();

    if (this.state.score >= this.winScore || this.opponentScore >= this.winScore) {
      // Host tells the guest now (carrying the final scores), so both boards show
      // the winning point; the overlay is then revealed after END_DELAY on each side.
      if (this.role === 'host') {
        this.net?.send(OP_END, { hs: this.state.score, gs: this.opponentScore });
      }
      this.endMatch();
      return;
    }
    // Serve toward whoever was just scored on, after a short pause.
    this.resetBall(!toPlayer);
  }

  /**
   * Freezes the rally and reveals the result after a short beat, so the winning
   * point is visible on the scoreboard before the victory/defeat overlay.
   */
  private endMatch(): void {
    this.stop();
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.updateScoreDisplay();
    window.setTimeout(() => this.gameOver(), END_DELAY);
  }

  /** Recenters the ball and arms a serve toward the given side after a pause. */
  private resetBall(toPlayer: boolean): void {
    this.speed = BASE_SPEED;
    this.serveTimer = SERVE_DELAY;
    const angle = (Math.random() * 2 - 1) * (MAX_BOUNCE_ANGLE / 2);
    const dirX = toPlayer ? -1 : 1;
    this.ball = {
      x: BOARD / 2,
      y: BOARD / 2,
      vx: dirX * this.speed * Math.cos(angle),
      vy: this.speed * Math.sin(angle),
    };
  }

  /** Builds the persistent board structure (paddles + ball) once. */
  private buildBoard(): void {
    if (!this.boardElement) return;
    this.boardElement.innerHTML = `
      <div class="pong-net" aria-hidden="true"></div>
      <div class="pong-paddle pong-paddle--player"></div>
      <div class="pong-paddle pong-paddle--opponent"></div>
      <div class="pong-ball"></div>`;

    this.playerPaddleEl = this.boardElement.querySelector('.pong-paddle--player');
    this.opponentPaddleEl = this.boardElement.querySelector('.pong-paddle--opponent');
    this.ballElement = this.boardElement.querySelector('.pong-ball');

    for (const [el, x] of [
      [this.playerPaddleEl, PLAYER_X],
      [this.opponentPaddleEl, OPPONENT_X],
    ] as const) {
      if (!el) continue;
      el.style.width = `${PADDLE_T}%`;
      el.style.height = `${PADDLE_H}%`;
      el.style.left = `${x - PADDLE_T / 2}%`;
    }
    if (this.ballElement) {
      this.ballElement.style.width = `${BALL_R * 2}%`;
      this.ballElement.style.height = `${BALL_R * 2}%`;
    }
  }

  /** Positions the ball and both paddles from their logical state. */
  render(): void {
    if (this.ballElement) {
      this.ballElement.style.left = `${this.ball.x - BALL_R}%`;
      this.ballElement.style.top = `${this.ball.y - BALL_R}%`;
    }
    if (this.playerPaddleEl) this.playerPaddleEl.style.top = `${this.playerY - PADDLE_H / 2}%`;
    if (this.opponentPaddleEl) {
      this.opponentPaddleEl.style.top = `${this.opponentY - PADDLE_H / 2}%`;
    }
  }

  /** Resets scores, paddles, ball and state for a fresh match. */
  reset(): void {
    this.state.score = 0;
    this.state.isGameOver = false;
    this.state.isPaused = false;
    this.opponentScore = 0;
    this.playerY = BOARD / 2;
    this.opponentY = BOARD / 2;
    this.opponentTargetY = BOARD / 2;
    this.guestServing = true;
    this.resetBall(true);
    this.updateScoreDisplay();
    this.render();
  }

  /** Writes both scores into the game header. */
  protected updateScoreDisplay(): void {
    if (this.scoreElement) this.scoreElement.textContent = `Toi : ${this.state.score}`;
    if (this.opponentScoreElement) {
      this.opponentScoreElement.textContent = `Adversaire : ${this.opponentScore}`;
    }
  }

  /** Title of the game-over overlay: win or loss. */
  protected getGameOverTitle(): string {
    return this.state.score > this.opponentScore ? 'Gagné ! 🏆' : 'Perdu…';
  }

  /** Final score in the overlay body. */
  protected getGameOverContent(): string {
    return `<div>Toi : ${this.state.score} — Adversaire : ${this.opponentScore}</div>`;
  }

  /* ===========================================================================
     Multiplayer (relayed, host-authoritative). The host simulates the ball and
     scores and broadcasts them; the guest only sends its paddle and renders the
     mirrored host state (each player sees themselves on the left).
     ========================================================================= */

  /**
   * Game-over flow. In solo it uses the engine's default (overlay + Rejouer); in
   * multiplayer the host first tells the guest the match is over, then both show
   * the versus result overlay (Revanche for the host, Quitter for everyone).
   */
  protected onGameOver(): void {
    if (this.role === 'solo') {
      super.onGameOver();
      return;
    }
    // OP_END was already sent at the winning point (see concede); just show the result.
    this.showVersusGameOver();
  }

  /** Enters a session: adopts the match role and starts a synced round. */
  private beginVersus(net: NetMatch): void {
    this.net = net;
    this.role = net.role;
    this.settings?.setDisabled(true);
    net.onMessage((msg) => this.handleNetMessage(msg));
    this.startRound();
  }

  /** Leaves multiplayer (session ended): back to solo play vs the bot. */
  private endVersus(): void {
    this.net = null;
    this.role = 'solo';
    this.guestTargetY = BOARD / 2;
    this.settings?.setDisabled(false);
    this.overlay.hide();
    this.reset();
    this.start();
  }

  /** Restarts from a clean state behind a kickoff countdown (host & guest). */
  private startRound(): void {
    this.stop();
    // Clear any lingering overlay (e.g. the guest's "waiting for a rematch" on
    // OP_RESTART, or the versus result) before the new round's countdown.
    this.overlay.hide();
    this.reset();
    this.netSendAcc = 0;
    void runCountdown(3).then(() => {
      if (this.net) this.start();
    });
  }

  /** Dispatches a relayed message according to this client's role. */
  private handleNetMessage(msg: MatchMessage): void {
    if (this.role === 'host') {
      if (msg.opCode === OP_INPUT) {
        const data = msg.data as { y?: number } | null;
        if (data && typeof data.y === 'number') this.guestTargetY = this.clampPaddle(data.y);
      }
      return;
    }
    // Guest renders whatever the authoritative host sends.
    if (msg.opCode === OP_STATE) this.applyHostState(msg.data as HostState);
    else if (msg.opCode === OP_END) this.applyHostEnd(msg.data as { hs: number; gs: number });
    else if (msg.opCode === OP_RESTART) this.startRound();
  }

  /**
   * Applies an authoritative snapshot on the guest, mirrored so the guest also
   * sees itself on the left: the ball x is flipped, the host paddle becomes the
   * right-hand opponent, and the scores are swapped. The guest keeps driving its
   * own (left) paddle locally for responsiveness.
   */
  private applyHostState(s: HostState): void {
    const targetX = BOARD - s.bx; // mirror x (guest sees itself on the left)
    const targetY = s.by;
    if (s.sv) {
      // Serving: the ball is frozen at center on the host — snap exactly, no jitter.
      this.ball.x = targetX;
      this.ball.y = targetY;
    } else {
      // Playing: correct gently toward the authoritative position (prediction fills the gaps).
      this.ball.x += (targetX - this.ball.x) * NET_CORRECT;
      this.ball.y += (targetY - this.ball.y) * NET_CORRECT;
    }
    this.ball.vx = -s.bvx; // mirror x velocity
    this.ball.vy = s.bvy;
    this.speed = Math.hypot(s.bvx, s.bvy) || BASE_SPEED;
    this.guestServing = s.sv;
    this.opponentTargetY = s.hy;
    this.state.score = s.gs;
    this.opponentScore = s.hs;
    this.updateScoreDisplay();
  }

  /** Ends the match on the guest from the host's final scores. */
  private applyHostEnd(s: { hs: number; gs: number }): void {
    this.state.score = s.gs;
    this.opponentScore = s.hs;
    // Show the final score on the board, then reveal the overlay after the beat.
    this.endMatch();
  }

  /** Host triggers a rematch: tells the guest, then both restart synced. */
  private hostRematch(): void {
    this.net?.send(OP_RESTART, null);
    this.startRound();
  }

  /** Shows the versus result overlay (Revanche for the host, Quitter for all). */
  private showVersusGameOver(): void {
    const won = this.state.score > this.opponentScore;
    const buttons: GameOverlayButton[] = [];
    if (this.role === 'host') {
      buttons.push({
        text: 'Revanche',
        primary: true,
        onClick: () => {
          this.overlay.hide();
          this.hostRematch();
        },
      });
    }
    buttons.push({
      text: 'Quitter',
      primary: this.role !== 'host',
      onClick: () => {
        this.overlay.hide();
        this.multiplayer?.leave();
      },
    });
    const waiting =
      this.role === 'guest' ? '<p class="mp-status">En attente d’une revanche de l’hôte…</p>' : '';
    this.overlay.show({
      title: won ? 'Gagné ! 🏆' : 'Perdu…',
      bodyHtml: `<div>Toi : ${this.state.score} — Adversaire : ${this.opponentScore}</div>${waiting}`,
      buttons,
    });
  }

  /** Host: broadcasts the authoritative snapshot at ~25 Hz. */
  private maybeBroadcastState(dt: number): void {
    if (this.role !== 'host' || !this.net) return;
    this.netSendAcc += dt;
    if (this.netSendAcc < NET_SEND_MS) return;
    this.netSendAcc = 0;
    this.net.send(OP_STATE, {
      bx: this.ball.x,
      by: this.ball.y,
      bvx: this.ball.vx,
      bvy: this.ball.vy,
      hy: this.playerY,
      hs: this.state.score,
      gs: this.opponentScore,
      sv: this.serveTimer > 0,
    });
  }

  /** Guest: sends its paddle position to the host at ~25 Hz. */
  private sendGuestInput(dt: number): void {
    if (!this.net) return;
    this.netSendAcc += dt;
    if (this.netSendAcc < NET_SEND_MS) return;
    this.netSendAcc = 0;
    this.net.send(OP_INPUT, { y: this.playerY });
  }
}
