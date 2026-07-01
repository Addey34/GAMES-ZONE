import { describe, it, expect, beforeEach } from 'vitest';
import { setupHud } from './hud.js';

describe('setupHud', () => {
  let bar: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div class="game-details"></div>';
    bar = document.querySelector('.game-details')!;
  });

  it('renders one chip per stat, hidden until set', () => {
    setupHud([
      { key: 'score', icon: 'star', label: 'Score' },
      { key: 'time', icon: 'clock', label: 'Temps' },
    ]);
    const chips = bar.querySelectorAll('.game-stat');
    expect(chips).toHaveLength(2);
    expect(bar.querySelector('[data-stat="time"] i')?.className).toBe('fas fa-clock');
    expect(chips[0].hasAttribute('hidden')).toBe(true);
    expect(bar.querySelector('[data-stat="score"]')?.getAttribute('aria-label')).toBe('Score');
  });

  it('set() writes the value and reveals the chip; 0 still shows', () => {
    const hud = setupHud([{ key: 'score', icon: 'star', label: 'Score' }]);
    hud.set('score', 0);
    const chip = bar.querySelector<HTMLElement>('[data-stat="score"]')!;
    expect(chip.hidden).toBe(false);
    expect(chip.querySelector('.game-stat-value')?.textContent).toBe('0');
  });

  it('set() with empty/null hides the chip', () => {
    const hud = setupHud([{ key: 'time', icon: 'clock', label: 'Temps' }]);
    hud.set('time', 12);
    const chip = bar.querySelector<HTMLElement>('[data-stat="time"]')!;
    expect(chip.hidden).toBe(false);
    hud.set('time', null);
    expect(chip.hidden).toBe(true);
    expect(chip.querySelector('.game-stat-value')?.textContent).toBe('');
  });

  it('set() is a no-op for an undeclared key', () => {
    const hud = setupHud([{ key: 'score', icon: 'star', label: 'Score' }]);
    expect(() => hud.set('nope', 5)).not.toThrow();
  });

  it('toggle() flips a modifier class on the chip', () => {
    const hud = setupHud([{ key: 'time', icon: 'clock', label: 'Temps' }]);
    const chip = bar.querySelector<HTMLElement>('[data-stat="time"]')!;
    hud.toggle('time', 'is-low', true);
    expect(chip.classList.contains('is-low')).toBe(true);
    hud.toggle('time', 'is-low', false);
    expect(chip.classList.contains('is-low')).toBe(false);
  });

  it('rebuilding clears its own chips but keeps sibling markup', () => {
    bar.innerHTML = '<div class="ludo-players"></div>';
    setupHud([{ key: 'time', icon: 'clock', label: 'Temps' }]);
    setupHud([{ key: 'time', icon: 'clock', label: 'Temps' }]);
    expect(bar.querySelectorAll('.game-stat')).toHaveLength(1);
    expect(bar.querySelector('.ludo-players')).not.toBeNull();
  });
});
