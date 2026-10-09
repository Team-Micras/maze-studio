import { describe, expect, test } from 'vitest';

import {
  artboardIn,
  cellOf,
  constrainCamera,
  LIBRARY_INSETS,
  libraryColumns,
  libraryGrid,
  libraryLimits,
  mountedRows,
  revealCamera,
  rowOf,
  toScreen,
  zoomAround,
  zoomOf,
} from '@/render';

const SQUARE = { width: 16, height: 16 };
const VIEWPORT = { width: 1440, height: 900 };
const NOTEBOOK = LIBRARY_INSETS.notebook;

describe('libraryColumns', () => {
  test('fits 250 px columns on a notebook and 170 px on a phone, from 2 to 6', () => {
    expect(libraryColumns(1440, 'notebook')).toBe(5);
    expect(libraryColumns(1920, 'notebook')).toBe(6);
    expect(libraryColumns(600, 'notebook')).toBe(2);
    expect(libraryColumns(390, 'phone')).toBe(2);
    expect(libraryColumns(700, 'phone')).toBe(3);
    expect(libraryColumns(4000, 'phone')).toBe(6);
  });
});

describe('libraryGrid', () => {
  test('places artboards left to right, 640 wide with gaps of 200 and 210', () => {
    const grid = libraryGrid([SQUARE, SQUARE, SQUARE, SQUARE, SQUARE], 2);

    expect(grid.rows).toBe(3);
    expect(grid.width).toBe(2 * 640 + 200);
    expect(grid.height).toBe(3 * 640 + 2 * 210);
    expect(grid.places[1]).toEqual({ x: 840, y: 0, width: 640, height: 640 });
    expect(grid.places[4]).toEqual({ x: 0, y: 1700, width: 640, height: 640 });
    expect(rowOf(4, grid)).toBe(2);
  });

  test('keeps the longest side 640 and sets a narrow maze on the bottom of its slot, centred', () => {
    const grid = libraryGrid(
      [
        { width: 10, height: 5 },
        { width: 5, height: 10 },
      ],
      2
    );

    expect(grid.places[0]).toEqual({ x: 0, y: 320, width: 640, height: 320 });
    expect(grid.places[1]).toEqual({ x: 840 + 160, y: 0, width: 320, height: 640 });
  });

  test('has one row even when empty', () => {
    expect(libraryGrid([], 4).rows).toBe(1);
  });
});

describe('cellOf and artboardIn', () => {
  test('put the cell of an index in the grid and the artboard of a size in its cell', () => {
    expect(cellOf(7, 5)).toEqual({ x: 2 * 840, y: 850 });
    expect(artboardIn({ x: 100, y: 50 }, { width: 10, height: 5 })).toEqual({
      x: 100,
      y: 50 + 320,
      width: 640,
      height: 320,
    });
  });
});

describe('libraryLimits', () => {
  const grid = libraryGrid(
    Array.from({ length: 581 }, () => SQUARE),
    5
  );
  const limits = libraryLimits(grid, VIEWPORT, NOTEBOOK);

  test('fit the grid width between the side insets, top aligned', () => {
    expect(toScreen(limits.fit, { x: 0, y: 0 })).toEqual({ x: 56, y: 112 });
    expect(toScreen(limits.fit, { x: grid.width, y: 0 }).x).toBeCloseTo(1440 - 56, 9);
  });

  test('scroll the grid down to its end and no further', () => {
    const end = constrainCamera({ ...limits.fit, y: -1e9 }, limits);
    const start = constrainCamera({ ...limits.fit, y: 1e9 }, limits);

    expect(toScreen(end, { x: 0, y: grid.height }).y).toBeCloseTo(900 - 72, 6);
    expect(start.y).toBe(112);
  });

  test('zoom from half to four times the fit, centring a grid narrower than the room', () => {
    const out = zoomAround(limits.fit, 0.01, { x: 720, y: 450 }, limits);

    expect(zoomOf(out, limits)).toBeCloseTo(0.5, 9);
    expect(toScreen(out, { x: grid.width / 2, y: 0 }).x).toBeCloseTo(720, 9);
    expect(zoomOf(zoomAround(limits.fit, 100, { x: 720, y: 450 }, limits), limits)).toBeCloseTo(
      4,
      9
    );
  });

  test('keep a grid shorter than the room at the top inset', () => {
    const short = libraryLimits(libraryGrid([SQUARE, SQUARE], 5), VIEWPORT, NOTEBOOK);

    expect(constrainCamera({ ...short.fit, y: 500 }, short).y).toBe(112);
  });
});

describe('mountedRows', () => {
  const grid = libraryGrid(
    Array.from({ length: 581 }, () => SQUARE),
    5
  );

  test('are the rows on screen and one more above and below', () => {
    const k = 0.25;
    const camera = { x: 0, y: -10 * 850 * k, k };
    const shown = { first: 10, last: Math.ceil((10 * 850 + 900 / k) / 850) - 1 };

    expect(mountedRows(camera, VIEWPORT, grid)).toEqual({
      first: shown.first - 1,
      last: shown.last + 1,
    });
  });

  test('count a row whose bottom edge shows, and stay within the grid', () => {
    const k = 0.25;
    const peeking = { x: 0, y: -(10 * 850 + 600) * k, k };

    expect(mountedRows(peeking, VIEWPORT, grid).first).toBe(9);
    expect(mountedRows({ x: 0, y: 112, k }, VIEWPORT, grid).first).toBe(0);
    expect(mountedRows({ x: 0, y: -1e7, k }, VIEWPORT, grid).last).toBe(grid.rows - 1);
  });
});

describe('revealCamera', () => {
  const camera = { x: 56, y: 112, k: 0.25 };

  test('leaves a camera alone when the artboard is inside the insets', () => {
    expect(
      revealCamera(camera, { x: 0, y: 0, width: 640, height: 640 }, VIEWPORT, NOTEBOOK)
    ).toEqual(camera);
  });

  test('scrolls just enough to bring an artboard below into view', () => {
    const rect = { x: 0, y: 5 * 850, width: 640, height: 640 };
    const moved = revealCamera(camera, rect, VIEWPORT, NOTEBOOK);

    expect(toScreen(moved, { x: 0, y: rect.y + rect.height }).y).toBeCloseTo(900 - 72, 9);
    expect(moved.x).toBe(camera.x);
  });

  test('scrolls up to an artboard above, its top at the top inset', () => {
    const below = { x: 56, y: -3000, k: 0.25 };
    const moved = revealCamera(
      below,
      { x: 0, y: 850, width: 640, height: 640 },
      VIEWPORT,
      NOTEBOOK
    );

    expect(toScreen(moved, { x: 0, y: 850 }).y).toBeCloseTo(112, 9);
  });
});
