import { describe, expect, test } from 'vitest';

import {
  createMaze,
  diffMazes,
  explore,
  fillBorder,
  setGoals,
  setStart,
  setWall,
  shortestRoutes,
  type Edge,
  type Maze,
} from '@/maze';
import {
  boardGeometry,
  formatLength,
  overlayLayers,
  overlayStrokes,
  trackLayers,
  type BoardOverlays,
} from '@/render';

function shapes(path: string): number {
  return path.match(/M/g)?.length ?? 0;
}

const BORDERED = fillBorder(createMaze({ width: 4, height: 3 }));
const EDGES_OF_4_BY_3 = { borderRuns: 4, posts: 5 * 4 };

describe('trackLayers', () => {
  test('paints every wall and post red when nothing is marked', () => {
    const layers = trackLayers(BORDERED, boardGeometry(BORDERED));

    expect(shapes(layers.redWalls)).toBe(EDGES_OF_4_BY_3.borderRuns);
    expect(shapes(layers.redPosts)).toBe(EDGES_OF_4_BY_3.posts);
    expect(layers.bareWalls).toBe('');
    expect(layers.barePosts).toBe('');
    expect(layers.goal).toBe('');
    expect(layers.start).toBe('');
  });

  test('leaves bare the walls and posts that touch the start or a goal', () => {
    const marked = setGoals(
      setStart(setWall(BORDERED, { direction: 'vertical', x: 1, y: 0 }, true), {
        x: 0,
        y: 0,
      }),
      [{ x: 3, y: 2 }]
    );
    const layers = trackLayers(marked, boardGeometry(marked));

    expect(shapes(layers.bareWalls)).toBe(5);
    expect(shapes(layers.redWalls)).toBe(EDGES_OF_4_BY_3.borderRuns);
    expect(shapes(layers.barePosts)).toBe(8);
    expect(shapes(layers.redPosts)).toBe(EDGES_OF_4_BY_3.posts - 8);
    expect(shapes(layers.goal)).toBe(1);
    expect(shapes(layers.start)).toBe(1);
  });

  test('draws each straight run of walls of one paint as one rectangle', () => {
    const row = [0, 1, 2, 3].reduce(
      (maze, x) => setWall(maze, { direction: 'horizontal', x, y: 1 }, true),
      BORDERED
    );
    const split = setGoals(row, [{ x: 1, y: 1 }]);
    const geometry = boardGeometry(row);

    expect(shapes(trackLayers(row, geometry).redWalls)).toBe(EDGES_OF_4_BY_3.borderRuns + 1);
    expect(trackLayers(row, geometry).redWalls).toContain(
      `h${formatLength(4 * geometry.pitch)}v${formatLength(geometry.wall)}`
    );
    expect(shapes(trackLayers(split, geometry).bareWalls)).toBe(1);
    expect(shapes(trackLayers(split, geometry).redWalls)).toBe(EDGES_OF_4_BY_3.borderRuns + 2);
  });

  test('a wall put later next to a goal comes out bare', () => {
    const goal = setGoals(BORDERED, [{ x: 1, y: 1 }]);
    const before = trackLayers(goal, boardGeometry(goal));
    const walled = setWall(goal, { direction: 'horizontal', x: 1, y: 2 }, true);
    const after = trackLayers(walled, boardGeometry(walled));

    expect(shapes(after.bareWalls)).toBe(shapes(before.bareWalls) + 1);
    expect(after.redWalls).toBe(before.redWalls);
  });

  test('draws rails on every edge place on the board and none in a thumbnail', () => {
    const board = trackLayers(BORDERED, boardGeometry(BORDERED));
    const thumbnail = trackLayers(BORDERED, boardGeometry(BORDERED, { scale: 'thumbnail' }));

    expect(shapes(board.rails)).toBe(4 + 5);
    expect(thumbnail.rails).toBe('');
  });
});

describe('overlayLayers', () => {
  const maze: Maze = setStart(
    setGoals(BORDERED, [
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]),
    { x: 0, y: 0 }
  );
  const geometry = boardGeometry(maze);

  function draw(overlays: BoardOverlays) {
    return overlayLayers(geometry, overlays);
  }

  test('draws nothing when nothing is asked', () => {
    const layers = draw({});

    expect(Object.values(layers.diff).join('')).toBe('');
    expect(
      [layers.focusOutline, layers.focusArea, layers.selection, layers.preview, layers.cursor].join(
        ''
      )
    ).toBe('');
  });

  test('draws the routes asked for, with diagonals last, in straight runs and 45° diagonals', () => {
    const open = setGoals(setStart(createMaze({ width: 5, height: 5 }), { x: 0, y: 0 }), [
      { x: 4, y: 3 },
    ]);
    const openGeometry = boardGeometry(open);
    const routes = shortestRoutes(open);
    const layers = overlayLayers(openGeometry, { routes: { ...routes } });
    const only = overlayLayers(openGeometry, {
      routes: { withDiagonals: routes?.withDiagonals },
    });

    expect(layers.routes.map((route) => route.name)).toEqual(['withoutDiagonals', 'withDiagonals']);
    expect(only.routes.map((route) => route.name)).toEqual(['withDiagonals']);

    for (const { line } of layers.routes) {
      const points = [...line.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => [
        Number(x),
        Number(y),
      ]);
      const runs = line
        .split(/(?=[LQ])/)
        .map((part) => part[0])
        .join('');

      expect(runs).toMatch(/^M(LQ)*L$/);
      const start = [
        openGeometry.margin + 0.5 * openGeometry.pitch,
        openGeometry.margin + 4.5 * openGeometry.pitch,
      ];
      expect(
        Math.hypot(points[0][0] - start[0], points[0][1] - start[1]) / openGeometry.pitch
      ).toBeCloseTo(0.35, 1);
      for (let index = 1; index < points.length; index++) {
        const [dx, dy] = [
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1],
        ];
        expect(
          Math.min(Math.abs(dx), Math.abs(dy), Math.abs(Math.abs(dx) - Math.abs(dy)))
        ).toBeLessThan(0.02);
      }
    }
  });

  test('draws the search into a dead end and back over itself, sharp at the turn back', () => {
    const walls: readonly Edge[] = [
      { direction: 'vertical', x: 1, y: 0 },
      { direction: 'vertical', x: 1, y: 2 },
    ];
    const corridor = walls.reduce(
      (walled, edge) => setWall(walled, edge, true),
      setGoals(setStart(createMaze({ width: 2, height: 3 }), { x: 0, y: 0 }), [{ x: 1, y: 2 }])
    );
    const board = boardGeometry(corridor);
    const exploration = explore(corridor)!;
    const { line } = overlayLayers(board, { exploration }).exploration!;
    const end = (u: number, v: number): string =>
      `${formatLength(board.margin + u * board.pitch)} ${formatLength(board.margin + (3 - v) * board.pitch)}`;

    expect(exploration.steps.map(({ x, y }) => `${x},${y}`)).toEqual([
      '0,0',
      '0,1',
      '0,2',
      '0,1',
      '1,1',
      '1,2',
    ]);
    expect(line).toContain(`L${end(0.5, 2.5)}L`);
    expect(line).toContain(`Q${end(0.5, 1.5)}`);
    expect(line.endsWith(`L${end(1.5, 2.5)}`)).toBe(true);
  });

  test('outlines walls put, dashes walls taken and rings the marks that moved', () => {
    const after = setStart(
      setGoals(
        setWall(
          setWall(maze, { direction: 'vertical', x: 2, y: 0 }, true),
          { direction: 'horizontal', x: 0, y: 0 },
          false
        ),
        [
          { x: 3, y: 1 },
          { x: 3, y: 2 },
          { x: 2, y: 2 },
        ]
      ),
      { x: 1, y: 0 }
    );
    const diff = diffMazes(maze, after);
    const layers = draw({ diff });

    expect(shapes(layers.diff.added)).toBe(1);
    expect(shapes(layers.diff.marked)).toBe(2 + 1);
    expect(shapes(layers.diff.dashed)).toBe(1 + 1 + 1);
  });

  test('rings no start when the start stayed', () => {
    const after = setWall(maze, { direction: 'vertical', x: 2, y: 0 }, true);
    const diff = diffMazes(maze, after);
    const layers = draw({ diff });

    expect(layers.diff.marked).toBe('');
    expect(layers.diff.dashed).toBe('');
  });

  test('outlines the cells of a finding only when it points at no edge and no post', () => {
    const cells = draw({
      focus: { cells: [{ x: 1, y: 1 }], edges: [], posts: [] },
    });
    const edges = draw({
      focus: {
        cells: [{ x: 1, y: 1 }],
        edges: [{ direction: 'horizontal', x: 1, y: 1 }],
        posts: [{ x: 2, y: 2 }],
      },
    });

    expect(shapes(cells.focusOutline)).toBe(1);
    expect(cells.focusArea).toBe('');
    expect(edges.focusOutline).toBe('');
    expect(shapes(edges.focusArea)).toBe(2);
  });

  test('draws the same selection from either pair of corners', () => {
    const one = draw({
      selection: { from: { x: 0, y: 2 }, to: { x: 2, y: 0 } },
    });
    const other = draw({
      selection: { from: { x: 2, y: 0 }, to: { x: 0, y: 2 } },
    });

    expect(one.selection).toBe(other.selection);
    expect(shapes(one.selection)).toBe(1);
  });

  test('says whether the edge preview takes a wall away', () => {
    const edge = { direction: 'horizontal', x: 1, y: 1 } as const;

    expect(draw({ preview: { edge, removes: true } }).previewRemoves).toBe(true);
    expect(draw({ preview: { edge, removes: false } }).previewRemoves).toBe(false);
    expect(shapes(draw({ preview: { edge, removes: false } }).preview)).toBe(1);
  });

  test('scales every line with the pitch', () => {
    const large = overlayStrokes(boardGeometry(maze));
    const small = overlayStrokes(boardGeometry(maze, { size: 320 }));

    expect(large.cursor / small.cursor).toBeCloseTo(2, 9);
    expect(large.diffDash[0] / small.diffDash[0]).toBeCloseTo(2, 9);
    expect(large.cursor / geometry.pitch).toBeCloseTo(0.05, 9);
  });
});
