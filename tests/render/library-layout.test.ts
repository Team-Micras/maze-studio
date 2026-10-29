import { describe, expect, test } from 'vitest';

import {
  artboardIn,
  cameraOnto,
  LIBRARY_INSETS,
  libraryColumns,
  libraryLayout,
  libraryRect,
  mountedRows,
  ONE_ROW_TOP_BAR_WIDTH,
  revealCamera,
  revealScroll,
  rowOf,
  SLOT_GAP_X,
  SLOT_GAP_Y,
  toScreen,
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

describe('libraryLayout', () => {
  test('fills the width between the insets with its columns and their gaps', () => {
    const layout = libraryLayout(1440, 'notebook', 12);
    const span = layout.columns * layout.side + (layout.columns - 1) * layout.side * SLOT_GAP_X;

    expect(layout.columns).toBe(5);
    expect(layout.rows).toBe(3);
    expect(span).toBeCloseTo(1440 - NOTEBOOK.left - NOTEBOOK.right, 9);
    expect(layout.columnPitch).toBeCloseTo(layout.side * (1 + SLOT_GAP_X), 9);
    expect(layout.rowPitch).toBeCloseTo(layout.side * (1 + SLOT_GAP_Y), 9);
  });

  test('is as tall as its rows, their gaps and the insets, with one row when empty', () => {
    const layout = libraryLayout(390, 'phone', 5);
    const empty = libraryLayout(390, 'phone', 0);
    const phone = LIBRARY_INSETS.phone;

    expect(layout.rows).toBe(3);
    expect(layout.height).toBeCloseTo(
      phone.top + 3 * layout.side + 2 * layout.side * SLOT_GAP_Y + phone.bottom,
      9
    );
    expect(empty.rows).toBe(1);
  });

  test("leaves a second row's room at the top of a notebook too narrow for one row of islands", () => {
    expect(libraryLayout(ONE_ROW_TOP_BAR_WIDTH, 'notebook', 1).insets).toEqual(NOTEBOOK);
    expect(libraryLayout(ONE_ROW_TOP_BAR_WIDTH - 1, 'notebook', 1).insets).toEqual({
      ...NOTEBOOK,
      top: NOTEBOOK.top + 52,
    });
    expect(libraryLayout(390, 'phone', 1).insets).toEqual(LIBRARY_INSETS.phone);
  });
});

describe('libraryRect and artboardIn', () => {
  test('put a maze left to right and then down, its slot from the insets', () => {
    const layout = libraryLayout(1440, 'notebook', 12);
    const sixth = libraryRect(layout, 6, SQUARE);

    expect(libraryRect(layout, 0, SQUARE)).toEqual({
      x: NOTEBOOK.left,
      y: NOTEBOOK.top,
      width: layout.side,
      height: layout.side,
    });
    expect(sixth.x).toBeCloseTo(NOTEBOOK.left + layout.columnPitch, 9);
    expect(sixth.y).toBeCloseTo(NOTEBOOK.top + layout.rowPitch, 9);
  });

  test('keep the longest side and stand a narrow maze on the bottom of its slot, centred', () => {
    expect(artboardIn({ x: 0, y: 0 }, { width: 8, height: 16 }, 200)).toEqual({
      x: 50,
      y: 0,
      width: 100,
      height: 200,
    });
    expect(artboardIn({ x: 10, y: 20 }, { width: 16, height: 8 })).toEqual({
      x: 10,
      y: 340,
      width: 640,
      height: 320,
    });
  });
});

describe('mountedRows', () => {
  const layout = libraryLayout(1440, 'notebook', 100);

  test('are the rows on screen and one more above and below', () => {
    expect(mountedRows(layout, 0, 900)).toEqual({ first: 0, last: 3 });
    expect(mountedRows(layout, NOTEBOOK.top + 6 * layout.rowPitch + 1, 900)).toEqual({
      first: 5,
      last: 10,
    });
  });

  test('count a row whose bottom edge shows, and stay within the grid', () => {
    const justBelow = NOTEBOOK.top + 3 * layout.rowPitch + layout.side - 1;

    expect(mountedRows(layout, justBelow, 900).first).toBe(2);
    expect(mountedRows(layout, layout.height, 900).last).toBe(layout.rows - 1);
    expect(rowOf(11, layout)).toBe(2);
  });
});

describe('revealScroll', () => {
  test('leaves the scroll alone when the slot is inside the insets', () => {
    expect(revealScroll({ y: 300, height: 200 }, 0, 900, NOTEBOOK)).toBe(0);
  });

  test('scrolls just enough to bring a slot below into view, its bottom at the bottom inset', () => {
    expect(revealScroll({ y: 2000, height: 200 }, 0, 900, NOTEBOOK)).toBe(2200 - 900 + 72);
  });

  test('scrolls up to a slot above, its top at the top inset', () => {
    expect(revealScroll({ y: 800, height: 200 }, 3000, 900, NOTEBOOK)).toBe(800 - 112);
  });
});

describe('cameraOnto', () => {
  test('puts a world rectangle exactly over a screen rectangle', () => {
    const camera = cameraOnto(
      { x: 80, y: 0, width: 480, height: 640 },
      { x: 300, y: 200, width: 120, height: 160 }
    );

    expect(toScreen(camera, { x: 80, y: 0 })).toEqual({ x: 300, y: 200 });
    expect(toScreen(camera, { x: 560, y: 640 })).toEqual({ x: 420, y: 360 });
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
