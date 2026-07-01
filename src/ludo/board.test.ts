import { describe, it, expect } from 'vitest';
import { RING_PATH, HOME_LANES, STABLES, CENTER, GRID, pawnCell, Cell } from './board.js';
import { entryCell, STABLE, RING, RING_TRAVEL, FINISH, SEATS, PAWNS } from './ludo.js';

const key = (c: Cell): string => `${c[0]},${c[1]}`;
/** Orthogonal neighbour (straight step), used for the home lanes. */
const adjacent = (a: Cell, b: Cell): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
/** King-move neighbour: the ring turns diagonally at the 4 inner corners. */
const touches = (a: Cell, b: Cell): boolean =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1;
const inGrid = (c: Cell): boolean => c[0] >= 0 && c[0] < GRID && c[1] >= 0 && c[1] < GRID;

describe('ring path', () => {
  it('has exactly 52 cells, all distinct and on the board', () => {
    expect(RING_PATH).toHaveLength(RING);
    expect(new Set(RING_PATH.map(key)).size).toBe(RING);
    expect(RING_PATH.every(inGrid)).toBe(true);
  });

  it('is a continuous, closed loop (each cell touches the next)', () => {
    for (let i = 0; i < RING_PATH.length; i++) {
      const next = RING_PATH[(i + 1) % RING_PATH.length];
      expect(touches(RING_PATH[i], next)).toBe(true);
    }
  });

  it('places each seat entry 13 cells apart', () => {
    for (let seat = 0; seat < SEATS; seat++) {
      expect(entryCell(seat)).toBe(seat * 13);
    }
  });
});

describe('home lanes', () => {
  it('give each seat 5 distinct in-grid cells, connected to the ring', () => {
    for (let seat = 0; seat < SEATS; seat++) {
      const lane = HOME_LANES[seat];
      expect(lane).toHaveLength(5);
      expect(lane.every(inGrid)).toBe(true);
      // The first home cell touches the seat's last ring cell (distance 50).
      const lastRing = RING_PATH[(entryCell(seat) + RING_TRAVEL - 1) % RING];
      expect(adjacent(lastRing, lane[0])).toBe(true);
      // The lane itself is contiguous.
      for (let i = 0; i < lane.length - 1; i++) {
        expect(adjacent(lane[i], lane[i + 1])).toBe(true);
      }
    }
  });
});

describe('stables', () => {
  it('give each seat 4 distinct in-grid slots', () => {
    const all = STABLES.flat();
    expect(all).toHaveLength(SEATS * PAWNS);
    expect(new Set(all.map(key)).size).toBe(SEATS * PAWNS);
    expect(all.every(inGrid)).toBe(true);
  });
});

describe('pawnCell', () => {
  it('maps the lifecycle of a horse from stable to centre', () => {
    expect(pawnCell(0, 2, STABLE)).toEqual(STABLES[0][2]);
    expect(pawnCell(0, 0, 0)).toEqual(RING_PATH[0]); // seat 0 start
    expect(pawnCell(1, 0, 0)).toEqual(RING_PATH[13]); // seat 1 start
    expect(pawnCell(0, 0, RING_TRAVEL)).toEqual(HOME_LANES[0][0]); // first home cell
    expect(pawnCell(0, 0, FINISH)).toEqual(CENTER);
  });
});
