import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CountdownTimer } from './countdownTimer.js';

describe('CountdownTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('paints the starting value immediately', () => {
    const timer = new CountdownTimer();
    const onTick = vi.fn();
    timer.start({ seconds: 5, onTick, onExpire: vi.fn() });
    expect(onTick).toHaveBeenCalledExactlyOnceWith(5);
    expect(timer.remaining).toBe(5);
    expect(timer.isRunning).toBe(true);
  });

  it('ticks down once per second and expires at zero', () => {
    const timer = new CountdownTimer();
    const ticks: number[] = [];
    const onExpire = vi.fn();
    timer.start({ seconds: 3, onTick: (r) => ticks.push(r), onExpire });

    vi.advanceTimersByTime(3000);

    // Initial 3, then 2, 1, 0.
    expect(ticks).toEqual([3, 2, 1, 0]);
    expect(onExpire).toHaveBeenCalledOnce();
    expect(timer.isRunning).toBe(false);
    expect(timer.remaining).toBe(0);
  });

  it('stops without firing onExpire when cancelled early', () => {
    const timer = new CountdownTimer();
    const onExpire = vi.fn();
    timer.start({ seconds: 10, onTick: vi.fn(), onExpire });

    vi.advanceTimersByTime(2000);
    timer.stop();
    vi.advanceTimersByTime(10000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(timer.remaining).toBe(8);
    expect(timer.isRunning).toBe(false);
  });

  it('restarting cancels the previous run', () => {
    const timer = new CountdownTimer();
    const first = vi.fn();
    const second = vi.fn();
    timer.start({ seconds: 5, onTick: vi.fn(), onExpire: first });
    timer.start({ seconds: 2, onTick: vi.fn(), onExpire: second });

    vi.advanceTimersByTime(2000);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('honours a custom interval', () => {
    const timer = new CountdownTimer();
    const onExpire = vi.fn();
    timer.start({ seconds: 2, onTick: vi.fn(), onExpire, intervalMs: 500 });

    vi.advanceTimersByTime(999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledOnce();
  });
});
