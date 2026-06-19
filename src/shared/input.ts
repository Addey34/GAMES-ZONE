/**
 * One of the four cardinal directions used by grid games.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Integer 2D vector (grid coordinates).
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Unit movement associated with each direction (origin at the top left,
 * `y` increasing downward).
 */
export const DIRECTION_DELTAS: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Direction opposite to a given direction (useful to forbid U-turns).
 */
export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/**
 * Lookup table from keyboard key → direction (arrows and ZQSD/WASD).
 */
const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  // WASD (QWERTY keyboard) and ZQSD (AZERTY keyboard): same directions.
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  z: 'up',
  q: 'left',
};

/**
 * Converts a keyboard event into a direction.
 *
 * @returns The matching direction, or `null` if the key is not one.
 */
export function keyboardDirection(event: KeyboardEvent): Direction | null {
  // event.key may be uppercase (Shift/Caps Lock): we normalize to lowercase
  // so that W/Z/Q/S/A/D work too.
  return KEY_TO_DIRECTION[event.key] ?? KEY_TO_DIRECTION[event.key.toLowerCase()] ?? null;
}

/**
 * Options for the touch swipe detector.
 */
export interface SwipeOptions {
  /** Minimum movement (px) for a gesture to count as a swipe (default: 30). */
  threshold?: number;
  /** Called with the direction of a validated swipe. */
  onSwipe: (direction: Direction) => void;
  /** Called for a simple tap (movement below the threshold), if provided. */
  onTap?: () => void;
}

/**
 * Wires up swipe (and tap) detection on an element, to make direction-based
 * games playable by finger on mobile.
 *
 * Unifies mouse and touch via Pointer Events; during the gesture, the browser's
 * native scroll/zoom is neutralized on the target (`touch-action: none`) and the
 * pointer is captured to receive the release even if the finger leaves the
 * element.
 *
 * @returns Cleanup function removing the listeners and restoring the style.
 */
export function setupSwipe(target: HTMLElement, options: SwipeOptions): () => void {
  const threshold = options.threshold ?? 30;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const previousTouchAction = target.style.touchAction;
  target.style.touchAction = 'none';

  const onPointerDown = (event: PointerEvent): void => {
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Capture unavailable (pointer already released): harmless.
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!tracking) return;
    tracking = false;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < threshold) {
      options.onTap?.();
      return;
    }

    if (absX > absY) {
      options.onSwipe(dx > 0 ? 'right' : 'left');
    } else {
      options.onSwipe(dy > 0 ? 'down' : 'up');
    }
  };

  const onPointerCancel = (): void => {
    tracking = false;
  };

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);

  return () => {
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerCancel);
    target.style.touchAction = previousTouchAction;
  };
}
