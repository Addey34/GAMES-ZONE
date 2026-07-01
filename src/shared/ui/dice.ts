/**
 * Reusable animated die for board games (Ludo today, any future dice game).
 *
 * Mounted into a host element, it shows a central die that the active player
 * **clicks to roll** (suspense), tumbles through random faces, then settles on
 * the result for everyone to see. Bots skip the click but get the same tumble.
 *
 * The caller owns the random value (so it stays testable and, later,
 * network-syncable): the die only *animates to* the value it is given. While the
 * player then chooses a move, {@link DiceHandle.park} shrinks the die to a
 * corner so the result stays visible without hiding the board.
 */

/** Pip positions (1..9 in a 3×3 grid, row-major) lit for each die value. */
const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export interface DiceOptions {
  /** Tumble duration before the result settles (ms). */
  rollMs?: number;
  /** How long the settled result is held before {@link DiceHandle.show} resolves (ms). */
  holdMs?: number;
}

/** Which corner the parked die settles into (defaults to top-right). */
export type DiceCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';

/** A mounted die: prompt the roll, animate a value, park, hide, destroy. */
export interface DiceHandle {
  /** Shows the clickable "roll" prompt; resolves once the player rolls. */
  awaitRoll(): Promise<void>;
  /** Tumbles, settles on `value`, holds briefly, then resolves. */
  show(value: number): Promise<void>;
  /** Shrinks the die into a corner (so a move can be chosen under it). The
   *  caller picks which corner — e.g. Ludo parks it in the active seat's stable. */
  park(corner?: DiceCorner): void;
  /** Sets an accent colour (any CSS colour) for the die's outline, or clears it
   *  with `null` — e.g. Ludo tints it with the colour of the seat that is playing. */
  setAccent(color: string | null): void;
  /** Hides the die. */
  hide(): void;
  /** Removes the die from the DOM. */
  destroy(): void;
}

/** Creates and mounts a die inside `host` (which should be `position: relative`). */
export function createDice(host: HTMLElement, options: DiceOptions = {}): DiceHandle {
  const rollMs = options.rollMs ?? 900;
  const holdMs = options.holdMs ?? 650;

  const root = document.createElement('div');
  root.className = 'dice';
  root.hidden = true;

  const face = document.createElement('button');
  face.type = 'button';
  face.className = 'dice-face';
  face.setAttribute('aria-label', 'Roll the die');

  const pips: HTMLElement[] = [];
  for (let i = 1; i <= 9; i++) {
    const pip = document.createElement('span');
    pip.className = 'dice-pip';
    face.appendChild(pip);
    pips.push(pip);
  }

  const hint = document.createElement('span');
  hint.className = 'dice-hint';
  hint.textContent = 'Lancer';

  root.append(face, hint);
  host.appendChild(root);

  let cycle: ReturnType<typeof setInterval> | null = null;

  const setFace = (value: number): void => {
    const on = PIPS[value] ?? [];
    pips.forEach((pip, i) => pip.classList.toggle('is-on', on.includes(i + 1)));
  };

  const stopCycle = (): void => {
    if (cycle !== null) {
      clearInterval(cycle);
      cycle = null;
    }
  };

  const resetClasses = (): void => {
    root.classList.remove('is-prompt', 'is-rolling', 'is-result', 'is-parked');
  };

  setFace(6);

  return {
    awaitRoll(): Promise<void> {
      stopCycle();
      resetClasses();
      root.hidden = false;
      root.classList.add('is-prompt');
      setFace(6);
      return new Promise((resolve) => {
        face.onclick = (): void => {
          face.onclick = null;
          root.classList.remove('is-prompt');
          resolve();
        };
      });
    },

    show(value: number): Promise<void> {
      stopCycle();
      face.onclick = null;
      resetClasses();
      root.hidden = false;
      root.classList.add('is-rolling');
      cycle = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 80);
      return new Promise((resolve) => {
        setTimeout(() => {
          stopCycle();
          setFace(value);
          root.classList.remove('is-rolling');
          root.classList.add('is-result');
          setTimeout(resolve, holdMs);
        }, rollMs);
      });
    },

    park(corner: DiceCorner = 'top-right'): void {
      stopCycle();
      face.onclick = null;
      root.dataset.corner = corner;
      root.classList.remove('is-prompt', 'is-rolling');
      root.classList.add('is-result', 'is-parked');
    },

    setAccent(color: string | null): void {
      if (color) root.style.setProperty('--dice-accent', color);
      else root.style.removeProperty('--dice-accent');
    },

    hide(): void {
      stopCycle();
      face.onclick = null;
      resetClasses();
      root.hidden = true;
    },

    destroy(): void {
      stopCycle();
      root.remove();
    },
  };
}
