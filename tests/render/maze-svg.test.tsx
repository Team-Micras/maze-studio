import { describe, expect, test } from 'vitest';

import { createMaze, fillBorder } from '@/maze';
import { boardGeometry, formatLength, mazeSvg, SLAB_RING, trackPaint } from '@/render';
import styles from '@/ui/styles.css?raw';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

function parse(svg: string): Element {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  return document.documentElement;
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
    expect(svg).not.toMatch(/<script|href|url\(|@import|@font-face/);
  });

  test('draws the layers the board draws, a straight run of walls as one shape', () => {
    const maze = fillBorder(createMaze({ width: 4, height: 3 }));
    const paths = [...parse(mazeSvg(maze)).querySelectorAll('path')].map((path) =>
      path.getAttribute('d')
    );
    const layers = trackPaint(maze, boardGeometry(maze)).filter((layer) => layer.d !== '');
    const walls = layers.find((layer) => layer.name === 'red-walls');

    expect(paths).toEqual(layers.map((layer) => layer.d));
    expect(walls?.d.match(/M/g)).toHaveLength(4);
  });

  test("rings the board in the dark theme with the app's slab ring and not in the light one", () => {
    const style = parse(mazeSvg(fillBorder(createMaze({ width: 4, height: 3 })))).querySelector(
      'style'
    )?.textContent;
    const darkSlab = styles.slice(styles.indexOf('.dark {')).match(/--slab-shadow:([^;]*);/)?.[1];

    expect(style).toContain('.slab{fill:none;stroke:none}');
    expect(style).toContain(`@media (prefers-color-scheme:dark){.slab{stroke:${SLAB_RING}}}`);
    expect(darkSlab).toContain(`0 0 0 1px ${SLAB_RING}`);
    expect(styles.slice(0, styles.indexOf('.dark {'))).not.toContain(`0 0 0 1px ${SLAB_RING}`);
  });
});
