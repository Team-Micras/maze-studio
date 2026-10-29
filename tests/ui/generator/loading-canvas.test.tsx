import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import {
  decorativeGoals,
  decorativeMaze,
  followTrack,
  SETTLE,
  WAITING,
  type LoadingTrack,
} from '@/render/loading';
import { LoadingCanvas } from '@/ui/generator/loading-canvas';

const SIZE = 16;
const REDUCED = '(prefers-reduced-motion: reduce)';

const motion = { reduced: false };

beforeAll(() => {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const list = real(query);

    if (query === REDUCED) {
      Object.defineProperty(list, 'matches', { get: () => motion.reduced });
    }

    return list;
  });
});

afterEach(() => {
  motion.reduced = false;
});

const goals = decorativeGoals(SIZE);
const grid = new Uint8Array(SIZE * SIZE).fill(15);

function snapshot(walls: Uint8Array, base: LoadingTrack = WAITING): LoadingTrack {
  return followTrack(base, { walls, tried: [{ route: [0, 1, 2] }] }, SIZE, performance.now());
}

function canvasOf(): HTMLCanvasElement | null {
  return document.querySelector('canvas[data-loading]');
}

function bitmap(): string {
  return canvasOf()?.toDataURL() ?? '';
}

function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const tick = (): void => {
      left -= 1;

      if (left <= 0) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

function canvas(track: () => LoadingTrack, builtAt?: number) {
  return (
    <LoadingCanvas
      builtAt={builtAt}
      scale="thumbnail"
      size={SIZE}
      style={{ width: 160, height: 160 }}
      track={track}
    />
  );
}

describe('LoadingCanvas without motion', () => {
  test('keeps the still wave, then the first maze-like walls, until the maze is built', async () => {
    motion.reduced = true;
    let track = WAITING;
    const screen = await render(canvas(() => track));
    await frames(2);
    const wave = bitmap();

    track = snapshot(grid);
    await frames(3);
    expect(bitmap()).toBe(wave);

    track = snapshot(decorativeMaze(SIZE, goals, 7), track);
    await expect.poll(bitmap).not.toBe(wave);
    const first = bitmap();

    track = snapshot(decorativeMaze(SIZE, goals, 8), track);
    await frames(3);
    expect(bitmap()).toBe(first);

    await screen.rerender(canvas(() => track, performance.now()));
    await expect.poll(canvasOf).toBeNull();
  });

  test('swaps in the built maze at once, where motion fades the skeleton out', async () => {
    const screen = await render(canvas(() => WAITING));
    await screen.rerender(canvas(() => WAITING, performance.now()));
    await frames(1);
    const fading = canvasOf();
    expect(fading).not.toBeNull();
    expect(Number(fading?.style.opacity)).toBeLessThan(1);
    await expect.poll(canvasOf, { timeout: SETTLE * 4 }).toBeNull();
  });
});

describe('LoadingCanvas', () => {
  test('keeps its bitmap and its observer as the track getter changes', async () => {
    const observe = vi.spyOn(ResizeObserver.prototype, 'observe');
    const screen = await render(canvas(() => WAITING));
    const element = canvasOf();
    const width = element?.width;
    const observed = observe.mock.calls.length;

    await screen.rerender(canvas(() => WAITING));
    await screen.rerender(canvas(() => snapshot(grid)));
    expect(canvasOf()).toBe(element);
    expect(element?.width).toBe(width);
    expect(observe.mock.calls.length).toBe(observed);
    observe.mockRestore();
  });
});
