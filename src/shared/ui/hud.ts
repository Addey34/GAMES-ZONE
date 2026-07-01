/**
 * Unified live-stats bar ("HUD") for the `.game-details` strip above the board.
 *
 * Every game shows the same kind of readouts — time, score, best score, lives,
 * turn… — but each used to hand-roll its own markup, class names and text
 * formats. This is the **single** way to declare and update them: a game lists
 * its stats once ({@link setupHud}) and updates a value by key
 * ({@link HudHandle.set}). Each stat renders as a uniform chip — a Font Awesome
 * icon + its value — so the "time" stat's clock icon is the shared time logo.
 * The game owns only the values; the markup and styling are identical everywhere.
 */

export interface StatDef {
  /** Stable key used to update the stat (e.g. 'time', 'score', 'high'). */
  key: string;
  /** Font Awesome icon name without the `fa-` prefix (e.g. 'clock', 'trophy'). */
  icon: string;
  /** Accessible label (the icon alone isn't announced), e.g. 'Temps'. */
  label: string;
}

export interface HudHandle {
  /**
   * Sets a stat's value. An empty string or `null` hides the chip (to clear a
   * transient readout, e.g. Ludo's turn timer between turns). No-op for an
   * undeclared key.
   */
  set(key: string, value: string | number | null): void;
  /** Toggles a modifier class on a stat chip (e.g. 'is-low' for a warning). */
  toggle(key: string, className: string, on: boolean): void;
}

/**
 * Renders the given stats into `host` (default: the page's `.game-details`) and
 * returns a handle to update them. Idempotent: removes chips from a previous run
 * first, leaving sibling markup (e.g. Ludo's player badges) untouched.
 */
export function setupHud(defs: StatDef[], host?: HTMLElement | null): HudHandle {
  const bar = host ?? document.querySelector<HTMLElement>('.game-details');
  const chips = new Map<string, HTMLElement>();
  const values = new Map<string, HTMLElement>();

  if (bar) {
    bar.querySelectorAll('.game-stat').forEach((el) => el.remove());

    for (const def of defs) {
      const chip = document.createElement('span');
      chip.className = 'game-stat';
      chip.dataset.stat = def.key;
      chip.hidden = true; // revealed on the first set()
      chip.setAttribute('aria-label', def.label);

      const icon = document.createElement('i');
      icon.className = `fas fa-${def.icon}`;
      icon.setAttribute('aria-hidden', 'true');

      const value = document.createElement('span');
      value.className = 'game-stat-value';

      chip.append(icon, value);
      bar.appendChild(chip);
      chips.set(def.key, chip);
      values.set(def.key, value);
    }
  }

  return {
    set(key, value): void {
      const chip = chips.get(key);
      const valueEl = values.get(key);
      if (!chip || !valueEl) return;
      const empty = value === null || value === '';
      chip.hidden = empty;
      valueEl.textContent = empty ? '' : String(value);
    },
    toggle(key, className, on): void {
      chips.get(key)?.classList.toggle(className, on);
    },
  };
}
