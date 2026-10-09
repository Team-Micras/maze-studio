import { describe, expect, test } from 'vitest';

import {
  minimapFrame,
  minimapView,
  minimapWorldPoint,
  showsMinimap,
  toScreen,
  type Camera,
} from '@/render';

const BOARD = { x: 0, y: 0, width: 640, height: 320 };
const VIEWPORT = { width: 1000, height: 500 };

describe('showsMinimap', () => {
  test('shows only past 1.06 times the fit', () => {
    expect(showsMinimap(1, 1)).toBe(false);
    expect(showsMinimap(1.06, 1)).toBe(false);
    expect(showsMinimap(1.061, 1)).toBe(true);
    expect(showsMinimap(0.53, 0.5)).toBe(false);
    expect(showsMinimap(0.54, 0.5)).toBe(true);
  });
});

describe('minimapFrame', () => {
  test('gives the board 148 pixels on its longest side', () => {
    expect(minimapFrame(BOARD)).toEqual({ width: 148, height: 74, scale: 148 / 640 });
    expect(minimapFrame({ x: 0, y: 0, width: 320, height: 640 }, 108).height).toBe(108);
  });
});

describe('minimapView', () => {
  const frame = minimapFrame(BOARD);

  test('covers the whole board when the whole board is on screen', () => {
    const camera: Camera = { x: 180, y: 90, k: 1 };

    expect(minimapView(camera, VIEWPORT, BOARD, frame)).toEqual({
      x: 0,
      y: 0,
      width: frame.width,
      height: frame.height,
    });
  });

  test('marks the part on screen when zoomed in', () => {
    const camera: Camera = { x: -640, y: -320, k: 4 };
    const view = minimapView(camera, VIEWPORT, BOARD, frame);

    expect(view.x).toBeCloseTo(160 * frame.scale, 9);
    expect(view.y).toBeCloseTo(80 * frame.scale, 9);
    expect(view.width).toBeCloseTo(250 * frame.scale, 9);
    expect(view.height).toBeCloseTo(125 * frame.scale, 9);
  });

  test('is cut to the board when the screen reaches past it', () => {
    const camera: Camera = { x: -2400, y: -1000, k: 4 };
    const view = minimapView(camera, VIEWPORT, BOARD, frame);

    expect(view.x + view.width).toBeCloseTo(frame.width, 9);
    expect(view.y + view.height).toBeCloseTo(frame.height, 9);
    expect(view.x).toBeCloseTo(600 * frame.scale, 9);
  });
});

describe('minimapWorldPoint', () => {
  test('reads a point of the minimap as the world point it shows', () => {
    const board = { x: 1000, y: 200, width: 640, height: 320 };
    const frame = minimapFrame(board);
    const point = minimapWorldPoint({ x: 37, y: 74 }, board, frame);

    expect(point.x).toBeCloseTo(1160, 9);
    expect(point.y).toBeCloseTo(520, 9);
    expect(toScreen({ x: 0, y: 0, k: 1 }, point).x).toBeCloseTo(1160, 9);
  });
});
