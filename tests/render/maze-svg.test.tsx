import { describe, expect, test } from 'vitest';

import { createMaze, fillBorder, setGoals, setStart } from '@/maze';
import { boardGeometry, formatLength, mazeSvg, trackPaint } from '@/render';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

function parse(svg: string): Element {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  return document.documentElement;
}

function painted(color: string): readonly number[] {
  const context = new OffscreenCanvas(1, 1).getContext('2d');

  if (context === null) {
    throw new Error('no 2D context');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
}

async function imageOf(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  image.src = url;
  await image.decode();
  URL.revokeObjectURL(url);
  return image;
}

describe('mazeSvg', () => {
  test.each([
    ['16×16', REPO_MAZES.classic],
    ['32×32', REPO_MAZES.halfsize],
  ])('writes a %s repository maze as an SVG that parses and loads as an image', async (_, path) => {
    const maze = await repoMaze(path);
    const geometry = boardGeometry(maze);
    const svg = mazeSvg(maze);
    const root = parse(svg);
    const image = await imageOf(svg);

    expect(root.getAttribute('viewBox')).toBe(
      `0 0 ${formatLength(geometry.width)} ${formatLength(geometry.height)}`
    );
    expect(root.getAttribute('width')).toBe(formatLength(geometry.width));
    expect(image.naturalWidth).toBe(Math.round(geometry.width));
    expect(svg).not.toMatch(/<script|<style|href|url\(/);
  });

  test('draws the layers the board draws, a straight run of walls as one shape', () => {
    const maze = fillBorder(createMaze({ width: 4, height: 3 }));
    const paths = [...parse(mazeSvg(maze)).querySelectorAll('path')].map((path) =>
      path.getAttribute('d')
    );
    const layers = trackPaint(maze, boardGeometry(maze));
    const walls = layers.find((layer) => layer.name === 'red-walls');

    expect(paths).toEqual(layers.map((layer) => layer.d));
    expect(walls?.d.match(/M/g)).toHaveLength(4);
  });

  test('writes each colour of the board as the sRGB the browser paints it', () => {
    const maze = setGoals(
      setStart(fillBorder(createMaze({ width: 4, height: 3 })), { x: 0, y: 0 }),
      [{ x: 3, y: 2 }]
    );
    const layers = trackPaint(maze, boardGeometry(maze));
    const svg = mazeSvg(maze);
    const paths = [...parse(svg).querySelectorAll('path')];
    const pairs = layers.flatMap((layer, index) =>
      (['fill', 'stroke'] as const).flatMap((key) => {
        const source = layer[key];
        return source === undefined || source === 'none'
          ? []
          : [{ source, written: paths[index]?.getAttribute(key) ?? '' }];
      })
    );
    const drift = pairs.map(({ source, written }) =>
      Math.max(
        ...painted(source).map((channel, rgb) => Math.abs(channel - (painted(written)[rgb] ?? 0)))
      )
    );

    expect(svg).not.toContain('oklch(');
    expect(pairs).toHaveLength(10);
    expect(pairs.map(({ written }) => written)).toEqual(
      pairs.map(() => expect.stringMatching(/^#[0-9a-f]{6}$/))
    );
    expect(Math.max(...drift)).toBeLessThanOrEqual(1);
  });
});
