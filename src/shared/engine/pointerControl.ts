/**
 * Shared pointer control for paddle games (Breakout, Pong).
 *
 * Improves on a naive `board.pointermove` listener in two ways:
 *  - it tracks on `window`, so the paddle keeps following the cursor even when
 *    it leaves the square board (the letterbox margins in fullscreen, or the
 *    area next to the board) — the old listener went silent off-board, freezing
 *    the paddle;
 *  - optional **Pointer Lock**: a mouse click on the board captures the cursor
 *    inside the game and the paddle is then driven by relative `movementX/Y`, for
 *    an arcade feel without the cursor escaping to the screen edges; Esc releases
 *    it (works fullscreen or windowed). Touch is unaffected — it keeps absolute
 *    tracking while dragging. Hovering already moves the paddle (the cursor stays
 *    visible); the click only adds the capture.
 *
 * The caller stays in its own logical units: the helper reports a board-local
 * ratio (0..1 along `axis`) and reads the current ratio back to apply relative
 * (locked) motion, so the caller's own clamp naturally bounds the accumulation.
 */
export interface PaddlePointerConfig {
  /** The square play area: provides the bounds and is the Pointer Lock target. */
  board: HTMLElement;
  /** Axis the paddle slides along: `'x'` (Breakout) or `'y'` (Pong). */
  axis: 'x' | 'y';
  /** Reports a target paddle position as a board-local ratio (0..1). */
  onMove: (ratio: number) => void;
  /** Reads the current paddle position as a ratio (0..1); used for locked motion. */
  getRatio: () => number;
  /**
   * Whether a mouse click should grab the pointer. Defaults to always (fullscreen
   * or windowed); pass a guard to restrict it (e.g. only while a round is live).
   */
  shouldLock?: () => boolean;
}

export function setupPaddlePointer(config: PaddlePointerConfig): void {
  const { board, axis, onMove, getRatio } = config;
  const shouldLock = config.shouldLock ?? ((): boolean => true);

  const sizeOf = (rect: DOMRect): number => (axis === 'x' ? rect.width : rect.height);
  const offsetOf = (rect: DOMRect, e: PointerEvent): number =>
    axis === 'x' ? e.clientX - rect.left : e.clientY - rect.top;
  const movementOf = (e: PointerEvent): number => (axis === 'x' ? e.movementX : e.movementY);

  const trackAbsolute = (e: PointerEvent): void => {
    const rect = board.getBoundingClientRect();
    onMove(offsetOf(rect, e) / sizeOf(rect));
  };

  // On `window` so the paddle keeps tracking even outside the board.
  window.addEventListener('pointermove', (e) => {
    if (document.pointerLockElement === board) {
      const rect = board.getBoundingClientRect();
      onMove(getRatio() + movementOf(e) / sizeOf(rect));
      return;
    }
    // Touch: only react while a finger is down (a lifted finger mustn't move it).
    if (e.pointerType === 'touch' && e.buttons === 0) return;
    trackAbsolute(e);
  });

  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      trackAbsolute(e);
      return;
    }
    // Mouse: grab the pointer for immersive control (best-effort).
    if (shouldLock() && document.pointerLockElement !== board) {
      const result = board.requestPointerLock?.() as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {});
      }
    }
  });
}
