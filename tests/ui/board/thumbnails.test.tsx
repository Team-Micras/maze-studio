import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { diffMazes, encodeMazeCode, setStart, toggleWall } from '@/maze';
import { drawThumbnail, ThumbnailCache, thumbnailBand, thumbnailBytes } from '@/render';
import { thumbnailCache } from '@/ui/board/thumbnail-cache';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

function pixel(canvas: OffscreenCanvas | HTMLCanvasElement, x: number, y: number): number[] {
  const context = canvas.getContext('2d');
  return [...(context?.getImageData(Math.round(x), Math.round(y), 1, 1).data ?? [])];
}

function isRed([red = 0, green = 0, blue = 0]: number[]): boolean {
  return red > 150 && green < 90 && blue < 90;
}

function isFloor([red = 0, green = 0, blue = 0]: number[]): boolean {
  return red < 30 && green < 30 && blue < 30;
}

const NO_DIFF = {
  added: [],
  removed: [],
  goalsAdded: [],
  goalsRemoved: [],
  startBefore: undefined,
  startAfter: undefined,
};

function redShare(canvas: HTMLCanvasElement | null): number {
  const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;

  if (data === undefined) {
    return 0;
  }

  let red = 0;

  for (let index = 0; index < data.length; index += 4) {
    red += isRed([data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]) ? 1 : 0;
  }

  return red / (data.length / 4);
}

describe('drawThumbnail', () => {
  test('paints the floor, red walls, and posts at the size of its band', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const canvas = drawThumbnail(maze, 256);
    const cell = 256 / (16 + 0.14 + 0.04);

    expect([canvas.width, canvas.height]).toEqual([256, 256]);
    expect(isFloor(pixel(canvas, 128 + cell / 2, 128 + cell / 2 + cell * 3))).toBe(true);
    expect(isRed(pixel(canvas, 256 - cell * 0.09, 256 / 2))).toBe(true);
  });

  test('draws the diff in blue on top', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const after = setStart(toggleWall(maze, { direction: 'horizontal', x: 5, y: 5 }), {
      x: 3,
      y: 3,
    });
    const plain = drawThumbnail(after, 128);
    const marked = drawThumbnail(after, 128, diffMazes(maze, after));
    const differs = (x: number, y: number) =>
      pixel(plain, x, y).join() !== pixel(marked, x, y).join();
    const cell = 128 / (16 + 0.18);
    const margin = 0.09 * cell;

    expect(differs(margin + cell * 5.5, 128 - margin - cell * 5)).toBe(true);
    expect(differs(margin + cell * 10.5, 128 - margin - cell * 10.5)).toBe(false);
  });
});

describe('ThumbnailCache', () => {
  test('draws once per band and serves the same bitmap after', async () => {
    const maze = await repoMaze(REPO_MAZES.taiwan);
    const cache = new ThumbnailCache();
    const key = encodeMazeCode(maze);
    const first = cache.thumbnail(key, maze, 200);

    expect(first.width).toBe(256);
    expect(cache.thumbnail(key, maze, 256)).toBe(first);
    expect(cache.thumbnail(key, maze, 257)).not.toBe(first);
    expect(cache.bytes).toBe(thumbnailBytes(first) + thumbnailBytes({ width: 512, height: 512 }));
  });

  test('keeps a thumbnail with a diff apart from the plain one and from other diffs', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const before = toggleWall(maze, { direction: 'horizontal', x: 5, y: 5 });
    const other = toggleWall(maze, { direction: 'vertical', x: 9, y: 9 });
    const cache = new ThumbnailCache();
    const key = encodeMazeCode(maze);
    const plain = cache.thumbnail(key, maze, 128);
    const fromBefore = cache.diffThumbnail(
      key,
      encodeMazeCode(before),
      maze,
      128,
      diffMazes(before, maze) ?? NO_DIFF
    );
    const fromOther = cache.diffThumbnail(
      key,
      encodeMazeCode(other),
      maze,
      128,
      diffMazes(other, maze) ?? NO_DIFF
    );

    expect(fromBefore).not.toBe(plain);
    expect(fromOther).not.toBe(fromBefore);
    expect(cache.diffThumbnail(key, encodeMazeCode(before), maze, 100, NO_DIFF)).toBe(fromBefore);
    expect(cache.thumbnail(key, maze, 128)).toBe(plain);
  });

  test('drops the least recently used bitmap once past its capacity', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const cache = new ThumbnailCache(2 * thumbnailBytes({ width: 64, height: 64 }));
    const first = cache.thumbnail('a', maze, 64);
    cache.thumbnail('b', maze, 64);
    cache.thumbnail('a', maze, 64);
    cache.thumbnail('c', maze, 64);

    expect(cache.thumbnail('a', maze, 64)).toBe(first);
    expect(cache.bytes).toBe(2 * thumbnailBytes({ width: 64, height: 64 }));
  });
});

describe('ThumbnailCanvas', () => {
  test('paints a live maze without leaving a bitmap in the shared cache', async () => {
    const maze = await repoMaze(REPO_MAZES.taiwan);
    const bytes = thumbnailCache.bytes;
    await render(<ThumbnailCanvas cached={false} height={148} maze={maze} width={148} />);
    const canvas = document.querySelector('canvas');

    await expect.poll(() => redShare(canvas)).toBeGreaterThan(0.05);
    expect(thumbnailCache.bytes).toBe(bytes);
  });

  test('paints again at each new size as the device pixel ratio changes twice', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia');
    const ratio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    const maze = await repoMaze(REPO_MAZES.classic);
    const changeRatio = (next: number): void => {
      const before = `(resolution: ${window.devicePixelRatio}dppx)`;
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: next });

      for (const result of matchMedia.mock.results) {
        if (result.type === 'return' && result.value.media === before) {
          result.value.dispatchEvent(new Event('change'));
        }
      }
    };

    try {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
      await render(<ThumbnailCanvas cached={false} height={100} maze={maze} width={100} />);
      const canvas = document.querySelector('canvas');
      expect(canvas?.width).toBe(100);

      changeRatio(2);
      await expect.poll(() => canvas?.width).toBe(200);
      changeRatio(3);
      await expect.poll(() => canvas?.width).toBe(300);
    } finally {
      if (ratio !== undefined) {
        Object.defineProperty(window, 'devicePixelRatio', ratio);
      }

      matchMedia.mockRestore();
    }
  });

  test('shows a cached thumbnail at its CSS size with the bitmap of its band behind it', async () => {
    const maze = await repoMaze(REPO_MAZES.halfsize);
    await render(<ThumbnailCanvas height={148} maze={maze} width={148} />);
    const canvas = document.querySelector('canvas');

    expect(canvas?.style.width).toBe('148px');
    await expect.poll(() => canvas?.width).toBe(thumbnailBand(148 * window.devicePixelRatio));
    await expect.poll(() => redShare(canvas)).toBeGreaterThan(0.05);
  });
});
