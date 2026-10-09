import { describe, expect, test } from 'vitest';

import {
  centerOn,
  constrainCamera,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_ZOOM,
  fitCamera,
  fitOf,
  flightPath,
  panCamera,
  pinchCamera,
  toScreen,
  toWorld,
  visibleWorld,
  zoomAround,
  zoomOf,
  type BoardView,
  type Camera,
} from '@/render';

const VIEW: BoardView = {
  board: { x: 0, y: 0, width: 640, height: 640 },
  viewport: { width: 1440, height: 900 },
  insets: EDITOR_INSETS,
  zoom: EDITOR_ZOOM,
  keep: EDITOR_KEEP,
};

function screenRect(camera: Camera, view: BoardView = VIEW) {
  const topLeft = toScreen(camera, view.board);
  const bottomRight = toScreen(camera, {
    x: view.board.x + view.board.width,
    y: view.board.y + view.board.height,
  });
  return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
}

describe('fitCamera', () => {
  test('fills the room between the editor insets and centres the board in it', () => {
    const fit = fitOf(VIEW);
    const rect = screenRect(fit);

    expect(fit.k).toBeCloseTo((900 - 80 - 108) / 640, 9);
    expect(rect.top).toBeCloseTo(80, 9);
    expect(rect.bottom).toBeCloseTo(900 - 108, 9);
    expect((rect.left + rect.right) / 2).toBeCloseTo(72 + (1440 - 144) / 2, 9);
  });

  test('fits by the width when the board is wide, wherever it is in the world', () => {
    const camera = fitCamera(
      { x: 1000, y: -300, width: 640, height: 320 },
      { width: 800, height: 900 },
      { top: 0, right: 0, bottom: 0, left: 0 }
    );

    expect(camera.k).toBeCloseTo(800 / 640, 9);
    expect(toScreen(camera, { x: 1000, y: -300 }).x).toBeCloseTo(0, 9);
    expect(toScreen(camera, { x: 1320, y: -140 }).y).toBeCloseTo(450, 9);
  });
});

describe('Screen and world', () => {
  test('turn into each other and back, and the viewport shows its own size over k', () => {
    const camera = { x: -120, y: 35, k: 2.5 };
    const back = toScreen(camera, toWorld(camera, { x: 300, y: 200 }));

    expect(back.x).toBeCloseTo(300, 9);
    expect(back.y).toBeCloseTo(200, 9);
    expect(visibleWorld(camera, { width: 1000, height: 500 })).toEqual({
      x: 48,
      y: -14,
      width: 400,
      height: 200,
    });
  });
});

describe('The editor limits', () => {
  test('keep the zoom between half and ten times the fit', () => {
    const fit = fitOf(VIEW);

    expect(zoomOf(constrainCamera({ ...fit, k: fit.k * 50 }, VIEW), VIEW)).toBeCloseTo(10, 9);
    expect(zoomOf(constrainCamera({ ...fit, k: fit.k * 0.1 }, VIEW), VIEW)).toBeCloseTo(0.5, 9);
    expect(constrainCamera(fit, VIEW)).toEqual(fit);
  });

  test('keep 96 pixels of the board on screen however far it is panned', () => {
    const fit = fitOf(VIEW);
    const right = screenRect(constrainCamera({ ...fit, x: 10_000 }, VIEW));
    const left = screenRect(constrainCamera({ ...fit, x: -10_000 }, VIEW));
    const down = screenRect(constrainCamera({ ...fit, y: 10_000 }, VIEW));
    const up = screenRect(constrainCamera({ ...fit, y: -10_000 }, VIEW));

    expect(right.left).toBeCloseTo(1440 - 96, 9);
    expect(left.right).toBeCloseTo(96, 9);
    expect(down.top).toBeCloseTo(900 - 96, 9);
    expect(up.bottom).toBeCloseTo(96, 9);
  });

  test('panCamera moves the world by the pixels given, inside the limits', () => {
    const fit = fitOf(VIEW);
    const moved = panCamera(fit, 40, -25, VIEW);

    expect(moved).toEqual({ ...fit, x: fit.x + 40, y: fit.y - 25 });
    expect(screenRect(panCamera(fit, 5_000, 0, VIEW)).left).toBeCloseTo(1440 - 96, 9);
  });
});

describe('zoomAround', () => {
  test('keeps the world point under the pointer where it is', () => {
    const fit = fitOf(VIEW);
    const at = { x: 500, y: 300 };
    const under = toWorld(fit, at);
    const zoomed = zoomAround(fit, 2, at, VIEW);
    const after = toScreen(zoomed, under);

    expect(zoomed.k).toBeCloseTo(fit.k * 2, 9);
    expect(after.x).toBeCloseTo(at.x, 9);
    expect(after.y).toBeCloseTo(at.y, 9);
  });

  test('stops at the zoom limits', () => {
    const fit = fitOf(VIEW);
    const center = { x: 720, y: 436 };

    expect(zoomOf(zoomAround(fit, 1000, center, VIEW), VIEW)).toBeCloseTo(10, 9);
    expect(zoomOf(zoomAround(fit, 0.001, center, VIEW), VIEW)).toBeCloseTo(0.5, 9);
  });
});

describe('centerOn', () => {
  test('puts the world point at the centre of the viewport, keeping the zoom', () => {
    const zoomed = { ...fitOf(VIEW), k: fitOf(VIEW).k * 4 };
    const centered = centerOn(zoomed, { x: 100, y: 500 }, VIEW);

    expect(centered.k).toBe(zoomed.k);
    expect(toScreen(centered, { x: 100, y: 500 }).x).toBeCloseTo(720, 9);
    expect(toScreen(centered, { x: 100, y: 500 }).y).toBeCloseTo(450, 9);
  });
});

describe('pinchCamera', () => {
  test('zooms with the spread of the fingers and keeps the world under their midpoint', () => {
    const start = fitOf(VIEW);
    const from = [
      { x: 600, y: 400 },
      { x: 700, y: 400 },
    ] as const;
    const to = [
      { x: 580, y: 420 },
      { x: 780, y: 420 },
    ] as const;
    const under = toWorld(start, { x: 650, y: 400 });
    const pinched = pinchCamera(start, from, to, VIEW);
    const after = toScreen(pinched, under);

    expect(pinched.k).toBeCloseTo(start.k * 2, 9);
    expect(after.x).toBeCloseTo(680, 9);
    expect(after.y).toBeCloseTo(420, 9);
  });

  test('stops at the zoom limits and survives two fingers on one spot', () => {
    const start = fitOf(VIEW);
    const together = [
      { x: 600, y: 400 },
      { x: 600, y: 400 },
    ] as const;
    const apart = [
      { x: 0, y: 400 },
      { x: 1400, y: 400 },
    ] as const;

    expect(zoomOf(pinchCamera(start, together, apart, VIEW), VIEW)).toBeCloseTo(1, 9);
    expect(
      zoomOf(
        pinchCamera(
          start,
          [
            { x: 700, y: 400 },
            { x: 701, y: 400 },
          ],
          apart,
          VIEW
        ),
        VIEW
      )
    ).toBeCloseTo(10, 9);
  });
});

describe('flightPath', () => {
  const anchor = { x: 2000, y: 1500, width: 640, height: 640 };
  const from = { x: -1200, y: -900, k: 0.6 };
  const to = fitCamera(anchor, VIEW.viewport, EDITOR_INSETS);
  const path = flightPath(from, to, anchor);
  const center = { x: 2320, y: 1820 };

  test('starts at the first camera and lands exactly on the second', () => {
    const start = path(0);

    expect(start.k).toBeCloseTo(from.k, 9);
    expect(start.x).toBeCloseTo(from.x, 9);
    expect(start.y).toBeCloseTo(from.y, 9);
    expect(path(1)).toBe(to);
  });

  test('moves the anchor centre on the straight line between its two screen places', () => {
    const start = toScreen(from, center);
    const end = toScreen(to, center);

    for (let step = 0; step <= 20; step++) {
      const eased = step / 20;
      const now = toScreen(path(eased), center);
      expect(now.x).toBeCloseTo(start.x + (end.x - start.x) * eased, 6);
      expect(now.y).toBeCloseTo(start.y + (end.y - start.y) * eased, 6);
    }
  });

  test('changes the size geometrically', () => {
    expect(path(0.5).k).toBeCloseTo(Math.sqrt(from.k * to.k), 9);
    expect(path(0.25).k / from.k).toBeCloseTo(path(0.75).k / path(0.5).k, 9);
  });
});
