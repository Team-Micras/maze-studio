import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { diffMazes, setGoals, setStart, toggleWall, type Edge, type Maze } from '@/maze';
import { ARTBOARD_SIZE, TRACK_COLORS, type BoardOverlays } from '@/render';
import { Board } from '@/ui/board/board';
import '@/ui/styles.css';
import { settled } from '@tests/support/ui/animations';
import { BoardHarness } from '@tests/support/ui/board-harness';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

const ALL_LAYERS = [
  'floor',
  'rails',
  'goal',
  'start',
  'red-walls',
  'bare-walls',
  'red-posts',
  'bare-posts',
  'diff-added',
  'diff-marked',
  'diff-dashed',
  'focus-area',
  'selection',
  'preview',
  'cursor',
];

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

function layer(name: string): SVGPathElement | null {
  return document.querySelector(`[data-layer="${name}"]`);
}

function shapes(name: string): number {
  return layer(name)?.getAttribute('d')?.match(/M/g)?.length ?? 0;
}

/**
 * The stage of the screenshots: the 640-unit board between 24 px insets fits at exactly k = 1, and
 * the harness knows the size before it measures, so the first frame already has the final camera.
 */
const SCREENSHOT_STAGE = { width: 688, height: 688 } as const;

const SCREENSHOT_INSETS = { top: 24, right: 24, bottom: 24, left: 24 } as const;

function worldTransform(): string | undefined {
  return document.querySelector<HTMLElement>('[data-world]')?.style.transform;
}

/** Whether the camera has a place and keeps it for two frames, so a screenshot catches it still. */
async function stillCamera(): Promise<boolean> {
  const before = worldTransform();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return before !== undefined && before !== '' && worldTransform() === before;
}

/** An edited copy of `maze` and the overlays that show everything at once over it. */
function edited(maze: Maze): { after: Maze; overlays: BoardOverlays } {
  const edges: Edge[] = [
    { direction: 'horizontal', x: 2, y: 3 },
    { direction: 'horizontal', x: 3, y: 3 },
    { direction: 'vertical', x: 5, y: 5 },
    { direction: 'vertical', x: 5, y: 6 },
    { direction: 'vertical', x: 1, y: 1 },
  ];
  const toggled = edges.reduce(toggleWall, maze);
  const goal = { x: maze.width - 2, y: maze.height - 3 };
  const after = setStart(setGoals(toggled, [...toggled.goals, goal]), { x: 1, y: 0 });
  const diff = diffMazes(maze, after);

  return {
    after,
    overlays: {
      diff,
      focus: {
        cells: [],
        edges: [{ direction: 'horizontal', x: 4, y: 7 }],
        posts: [{ x: 6, y: 3 }],
      },
      selection: { from: { x: 2, y: 8 }, to: { x: 4, y: 10 } },
      preview: { edge: { direction: 'vertical', x: 3, y: 2 }, removes: false },
      cursor: { x: 6, y: 9 },
    },
  };
}

describe('The board', () => {
  test('is as large as its geometry, its longest side 640 world units', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    await render(<Board maze={maze} />);
    const svg = document.querySelector('svg[data-board]');

    expect(svg?.getAttribute('width')).toBe(String(ARTBOARD_SIZE));
    expect(svg?.getBoundingClientRect().width).toBeCloseTo(ARTBOARD_SIZE, 3);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  test('is decorative without a label, and an image of that name with one', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const screen = await render(<Board maze={maze} />);

    expect(document.querySelector('svg[data-board]')?.getAttribute('role')).toBeNull();
    expect(document.querySelector('svg[data-board]')?.getAttribute('aria-label')).toBeNull();

    await screen.rerender(<Board label="AAMC15Maze, AAMC, 16 by 16" maze={maze} />);
    const svg = document.querySelector('svg[data-board]');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('AAMC15Maze, AAMC, 16 by 16');
    expect(svg?.hasAttribute('aria-hidden')).toBe(false);
    await expect
      .element(page.getByRole('img', { name: 'AAMC15Maze, AAMC, 16 by 16' }))
      .toBeVisible();
  });

  test('draws one path per layer, in the order of DESIGN.md 2.2 and 2.3', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const { after, overlays } = edited(maze);
    await render(<Board maze={after} overlays={overlays} />);

    expect(
      [...document.querySelectorAll('[data-layer]')].map((path) => path.getAttribute('data-layer'))
    ).toEqual(ALL_LAYERS);
  });

  test('paints the track colours, red walls and posts, white ones by the marks', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    await render(<Board maze={maze} />);

    expect(layer('floor')?.getAttribute('fill')).toBe(TRACK_COLORS.floor);
    expect(layer('red-walls')?.getAttribute('fill')).toBe(TRACK_COLORS.wall);
    expect(layer('red-posts')?.getAttribute('fill')).toBe(TRACK_COLORS.post);
    expect(layer('bare-walls')?.getAttribute('fill')).toBe(TRACK_COLORS.bare);
    expect(layer('bare-posts')?.getAttribute('fill')).toBe(TRACK_COLORS.bare);
    expect(layer('red-posts')?.getAttribute('stroke')).toBe(TRACK_COLORS.floor);
    expect(shapes('bare-posts')).toBe(4 + 9);
  });

  test('turns the walls around a new mark white at once', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const screen = await render(<Board maze={maze} />);
    const bare = shapes('bare-posts');
    await screen.rerender(<Board maze={setGoals(maze, [...maze.goals, { x: 2, y: 13 }])} />);

    expect(shapes('bare-posts')).toBe(bare + 4);
  });

  test('draws the preview of a wall taken away as a dashed outline over the floor', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    await render(
      <Board
        maze={maze}
        overlays={{ preview: { edge: { direction: 'horizontal', x: 0, y: 0 }, removes: true } }}
      />
    );

    expect(layer('preview')?.getAttribute('fill')).toBe(TRACK_COLORS.floor);
    expect(layer('preview')?.getAttribute('stroke-dasharray')).not.toBeNull();
  });
});

describe('Screenshots of the board on its stage', () => {
  test.each([
    ['16x16', REPO_MAZES.classic, 'light'],
    ['16x16', REPO_MAZES.classic, 'dark'],
    ['21x21', REPO_MAZES.taiwan, 'light'],
    ['21x21', REPO_MAZES.taiwan, 'dark'],
    ['32x32', REPO_MAZES.halfsize, 'light'],
    ['32x32', REPO_MAZES.halfsize, 'dark'],
  ])('%s with diff, cursor, selection and focus, %s', async (size, path, theme) => {
    const maze = await repoMaze(path);
    const { after, overlays } = edited(maze);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    await render(
      <BoardHarness
        insets={SCREENSHOT_INSETS}
        maze={after}
        overlays={overlays}
        size={SCREENSHOT_STAGE}
        status={false}
      />
    );
    await expect.poll(stillCamera).toBe(true);
    await settled();

    await expect.element(page.getByRole('application')).toMatchScreenshot(`${size}-${theme}`);
  });
});
