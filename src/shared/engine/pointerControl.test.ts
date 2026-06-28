import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupPaddlePointer } from './pointerControl.js';

/** Builds a board stubbed with a fixed 200×100 bounding box at the origin. */
function makeBoard(): HTMLElement {
  const board = document.createElement('div');
  board.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect;
  (board as unknown as { requestPointerLock: () => void }).requestPointerLock = vi.fn();
  document.body.appendChild(board);
  return board;
}

/** Dispatches a synthetic pointer event (happy-dom has no PointerEvent ctor). */
function firePointer(target: EventTarget, type: string, props: Partial<PointerEvent>): void {
  const event = new Event(type, { bubbles: true }) as Event & Partial<PointerEvent>;
  Object.assign(event, { pointerType: 'mouse', buttons: 0, movementX: 0, movementY: 0 }, props);
  target.dispatchEvent(event);
}

describe('setupPaddlePointer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.classList.remove('zen-mode');
  });

  it('reports a board-local ratio along x from a window-level move', () => {
    const board = makeBoard();
    const onMove = vi.fn();
    setupPaddlePointer({ board, axis: 'x', onMove, getRatio: () => 0 });

    firePointer(window, 'pointermove', { clientX: 50 });
    expect(onMove).toHaveBeenCalledWith(0.25);
  });

  it('keeps tracking past the board edges (caller clamps)', () => {
    const board = makeBoard();
    const onMove = vi.fn();
    setupPaddlePointer({ board, axis: 'x', onMove, getRatio: () => 0 });

    firePointer(window, 'pointermove', { clientX: 300 });
    expect(onMove).toHaveBeenLastCalledWith(1.5);
  });

  it('uses the y axis for vertical paddles', () => {
    const board = makeBoard();
    const onMove = vi.fn();
    setupPaddlePointer({ board, axis: 'y', onMove, getRatio: () => 0 });

    firePointer(window, 'pointermove', { clientY: 25 });
    expect(onMove).toHaveBeenCalledWith(0.25);
  });

  it('ignores a touch move while no finger is down', () => {
    const board = makeBoard();
    const onMove = vi.fn();
    setupPaddlePointer({ board, axis: 'x', onMove, getRatio: () => 0 });

    firePointer(window, 'pointermove', { pointerType: 'touch', buttons: 0, clientX: 50 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('grabs the pointer on a mouse click by default', () => {
    const board = makeBoard();
    setupPaddlePointer({ board, axis: 'x', onMove: vi.fn(), getRatio: () => 0 });

    firePointer(board, 'pointerdown', { clientX: 50 });
    expect(
      (board as unknown as { requestPointerLock: ReturnType<typeof vi.fn> }).requestPointerLock
    ).toHaveBeenCalled();
  });

  it('honours a shouldLock guard that refuses the grab', () => {
    const board = makeBoard();
    setupPaddlePointer({
      board,
      axis: 'x',
      onMove: vi.fn(),
      getRatio: () => 0,
      shouldLock: () => false,
    });

    firePointer(board, 'pointerdown', { clientX: 50 });
    expect(
      (board as unknown as { requestPointerLock: ReturnType<typeof vi.fn> }).requestPointerLock
    ).not.toHaveBeenCalled();
  });
});
