/**
 * Generic one-second countdown timer — the shared primitive behind any "time
 * left" readout (Typing's game chrono, Ludo's per-turn timer…).
 *
 * It owns only the `setInterval` lifecycle and the remaining-seconds bookkeeping;
 * the **caller owns the display** (via {@link CountdownOptions.onTick}) and what
 * happens at zero (via {@link CountdownOptions.onExpire}), so each game keeps its
 * own format (a bare number, `⏱ 12s`, a `.is-low` warning class…) without
 * re-hand-rolling the timer. This mirrors the rest of the shared layer (e.g.
 * `dice.ts`: the helper drives the mechanics, the game owns the rendering).
 *
 * Note this is **not** {@link runCountdown} (`ui/countdown.ts`) — that one is the
 * 3 · 2 · 1 · GO kickoff *overlay*; this is the live in-game timer.
 */

export interface CountdownOptions {
  /** Seconds to count down from. */
  seconds: number;
  /**
   * Called with the remaining seconds: once immediately with the starting value,
   * then after each tick down to 0. The game paints its readout here.
   */
  onTick: (remaining: number) => void;
  /** Called once the countdown reaches 0 (right after the final `onTick(0)`). */
  onExpire: () => void;
  /** Tick interval in ms (default 1000). */
  intervalMs?: number;
}

/** A restartable one-second countdown. Pure logic, no DOM — unit-testable. */
export class CountdownTimer {
  private id: ReturnType<typeof setInterval> | null = null;
  private secondsLeft = 0;

  /** Seconds remaining (the starting value during a run, 0 once expired). */
  get remaining(): number {
    return this.secondsLeft;
  }

  /** Whether a countdown is currently running. */
  get isRunning(): boolean {
    return this.id !== null;
  }

  /**
   * (Re)starts the countdown. Cancels any previous run, paints the starting
   * value immediately, then ticks down once per `intervalMs`, calling `onExpire`
   * when it hits 0.
   */
  start(options: CountdownOptions): void {
    this.stop();
    const { seconds, onTick, onExpire, intervalMs = 1000 } = options;
    this.secondsLeft = seconds;
    onTick(this.secondsLeft);
    this.id = setInterval(() => {
      this.secondsLeft -= 1;
      onTick(this.secondsLeft);
      if (this.secondsLeft <= 0) {
        this.stop();
        onExpire();
      }
    }, intervalMs);
  }

  /** Stops the countdown (no-op if not running). Leaves `remaining` untouched. */
  stop(): void {
    if (this.id !== null) {
      clearInterval(this.id);
      this.id = null;
    }
  }
}
