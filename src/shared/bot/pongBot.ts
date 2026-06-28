import { Difficulty, rollChase } from './difficulty.js';

/**
 * Pong opponent bot — the game's first real-time paddle bot.
 *
 * Pure decision logic (no DOM, no game loop): given the ball, the bot's paddle
 * and the board, it returns the y center the bot paddle should aim for. The game
 * then moves the paddle toward that target at a capped speed, which is what keeps
 * an `easy` bot beatable (it cannot teleport onto the ball).
 *
 * Difficulty reuses the shared {@link Difficulty} knob (see `difficulty.ts`):
 * `easy` only ever tracks the ball's *current* height (laggy, easy to wrong-foot),
 * `hard` always predicts where the ball will cross the paddle (wall bounces
 * included), `medium` mixes the two. When the ball moves away, the bot recenters.
 */

/** Everything the bot needs to decide, in logical board units (square 0–size). */
export interface PongBotView {
  /** Ball center. */
  ballX: number;
  ballY: number;
  /** Ball velocity (units/ms); only the signs/ratio matter here. */
  ballVx: number;
  ballVy: number;
  /** The bot paddle's x center (tells which side it defends). */
  paddleX: number;
  /** Board side length (square board). */
  boardSize: number;
}

/**
 * Predicts the ball's y when it reaches the bot paddle's x, reflecting off the
 * top/bottom walls (a triangle wave over [0, boardSize]). Returns the current
 * ball y when the ball has no horizontal motion.
 */
export function predictBallY(view: PongBotView): number {
  if (view.ballVx === 0) return view.ballY;

  const dx = view.paddleX - view.ballX;
  const raw = view.ballY + (view.ballVy / view.ballVx) * dx;

  // Fold the unbounded prediction back into [0, boardSize] via wall reflections.
  const size = view.boardSize;
  const period = 2 * size;
  let y = ((raw % period) + period) % period;
  if (y > size) y = period - y;
  return y;
}

/** True when the ball is heading toward the side this bot defends. */
function ballApproaching(view: PongBotView): boolean {
  return view.paddleX > view.boardSize / 2 ? view.ballVx > 0 : view.ballVx < 0;
}

/**
 * Returns the y center the bot paddle should move toward this step.
 *
 * @param view Current ball/paddle/board snapshot.
 * @param difficulty Tunes how often the bot predicts vs. naively follows.
 * @param rng Random source in [0, 1) — injectable for deterministic tests.
 */
export function pongBotTargetY(
  view: PongBotView,
  difficulty: Difficulty,
  rng: () => number = Math.random
): number {
  // Ball going away → drift back to the center, ready for the next exchange.
  if (!ballApproaching(view)) return view.boardSize / 2;

  // Play smart (anticipate the bounce) or just chase the ball's current height.
  return rollChase(difficulty, rng) ? predictBallY(view) : view.ballY;
}
