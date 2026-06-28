import { describe, it, expect } from 'vitest';
import { predictBallY, pongBotTargetY, PongBotView } from './pongBot.js';

/** Bot paddle on the right side of a 100×100 board (the usual opponent side). */
function view(overrides: Partial<PongBotView> = {}): PongBotView {
  return {
    ballX: 50,
    ballY: 50,
    ballVx: 0.05,
    ballVy: 0,
    paddleX: 97,
    boardSize: 100,
    ...overrides,
  };
}

describe('predictBallY', () => {
  it('returns the current y when the ball moves horizontally', () => {
    expect(predictBallY(view({ ballVy: 0, ballY: 30 }))).toBe(30);
  });

  it('returns the current y when the ball has no horizontal motion', () => {
    expect(predictBallY(view({ ballVx: 0, ballY: 42 }))).toBe(42);
  });

  it('follows a straight slope when no wall is hit', () => {
    // From (50,50) toward x=90, slope vy/vx = 0.5 → +20 over dx=40 → y=70.
    const y = predictBallY(view({ ballX: 50, ballY: 50, ballVx: 0.04, ballVy: 0.02, paddleX: 90 }));
    expect(y).toBeCloseTo(70, 6);
  });

  it('reflects off the bottom wall', () => {
    // Raw prediction 120 on a size-100 board reflects to 80 (2*100 - 120).
    const y = predictBallY(view({ ballX: 50, ballY: 50, ballVx: 0.04, ballVy: 0.07, paddleX: 90 }));
    expect(y).toBeCloseTo(80, 6); // 50 + (0.07/0.04)*40 = 120 → reflect → 80
  });
});

describe('pongBotTargetY', () => {
  it('recenters when the ball moves away from the bot', () => {
    // Bot on the right (x=97) but ball heading left (vx<0) → drift to center.
    const target = pongBotTargetY(view({ ballVx: -0.05, ballY: 10 }), 'hard');
    expect(target).toBe(50);
  });

  it('on easy, naively tracks the ball current height (never predicts)', () => {
    // easy chase chance is 0, so rollChase is always false regardless of rng.
    const target = pongBotTargetY(view({ ballY: 33, ballVy: 0.05 }), 'easy', () => 0);
    expect(target).toBe(33);
  });

  it('on hard, predicts the crossing height', () => {
    const v = view({ ballX: 50, ballY: 50, ballVx: 0.04, ballVy: 0.02, paddleX: 90 });
    expect(pongBotTargetY(v, 'hard')).toBeCloseTo(predictBallY(v), 6);
  });
});
