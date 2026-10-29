import { describe, expect, test } from 'vitest';

import {
  boardScene,
  decorativeGoals,
  decorativeMaze,
  followTrack,
  looksLikeMaze,
  PHASE_HOLD,
  openPassages,
  ROUTE_FADE,
  STILL_SHADE,
  WAITING,
  wallLines,
  waveScene,
  waveShade,
} from '@/render/loading';

const STEPS = [
  [0, 1, 1],
  [1, 0, 2],
  [0, -1, 4],
  [-1, 0, 8],
] as const;

/** The cells reached from the start through open passages. */
function reached(walls: Uint8Array, size: number): Set<number> {
  const seen = new Set([0]);
  const queue = [0];

  for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
    for (const [dx, dy, bit] of STEPS) {
      const x = (c % size) + dx;
      const y = Math.floor(c / size) + dy;
      const n = y * size + x;

      if (x >= 0 && y >= 0 && x < size && y < size && !((walls[c] ?? 0) & bit) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }

  return seen;
}

/** The passages from a goal cell to a cell outside the goal. */
function entrances(walls: Uint8Array, size: number, goals: readonly number[]): number {
  const goal = new Set(goals);
  let open = 0;

  for (const c of goals) {
    for (const [dx, dy, bit] of STEPS) {
      const x = (c % size) + dx;
      const y = Math.floor(c / size) + dy;
      const inside = x >= 0 && y >= 0 && x < size && y < size;
      open += inside && !goal.has(y * size + x) && !((walls[c] ?? 0) & bit) ? 1 : 0;
    }
  }

  return open;
}

const closed = (size: number) => new Uint8Array(size * size).fill(15);

const tried = (count: number) => Array.from({ length: count }, (_, k) => ({ route: [0, k + 1] }));

/** The track of a 16 × 16 maze after a snapshot of a closed board at `stage`, `attempt` and `now`. */
const at = (track: typeof WAITING, stage: string, attempt: number, now: number) =>
  followTrack(track, { walls: closed(16), tried: [], stage, attempt }, 16, now);

describe('decorativeMaze', () => {
  for (const size of [16, 32]) {
    test(`on ${size} × ${size} reaches every cell, its goal if any open through one entrance`, () => {
      const goals = decorativeGoals(size);
      const walls = decorativeMaze(size, goals);

      expect(reached(walls, size).size).toBe(size * size);
      expect(entrances(walls, size, goals)).toBe(goals.length === 0 ? 0 : 1);
      expect(walls.every((w, c) => !goals.includes(c) || (w & 15) !== 15)).toBe(true);
      expect(decorativeMaze(size, goals)).toEqual(walls);
    });
  }

  test('puts a 2 × 2 goal in the middle of 16 × 16 and none on 32 × 32', () => {
    expect(decorativeGoals(16)).toEqual([119, 120, 135, 136]);
    expect(decorativeGoals(32)).toEqual([]);
    expect(openPassages(decorativeMaze(32, []), 32)).toBe(32 * 32 - 1);
  });
});

describe('wallLines', () => {
  test('draws each wall once, the border included', () => {
    expect(wallLines(closed(2), 2)).toHaveLength(12);
    expect(wallLines(closed(16), 16)).toHaveLength(2 * 16 * 17);
  });
});

describe('looksLikeMaze', () => {
  test('takes a grid for no maze and half the passages of a spanning maze for one', () => {
    const size = 16;
    const walls = decorativeMaze(size, []);

    expect(openPassages(walls, size)).toBe(size * size - 1);
    expect(looksLikeMaze(closed(size), size)).toBe(false);
    expect(looksLikeMaze(walls, size)).toBe(true);

    const half = closed(size);
    let open = 0;

    for (let c = 0; c < size * size && open < (size * size - 1) / 2; c++) {
      if (c % size < size - 1) {
        half[c] = (half[c] ?? 0) & ~2;
        open++;
      }
    }

    expect(looksLikeMaze(half, size)).toBe(true);
    half[0] = (half[0] ?? 0) | 2;
    expect(looksLikeMaze(half, size)).toBe(false);
  });
});

describe('followTrack', () => {
  const size = 16;
  const maze = decorativeMaze(size, []);

  test('shows the border and the routes until a snapshot reads as a maze', () => {
    const track = followTrack(WAITING, { walls: closed(size), tried: tried(2) }, size, 100);
    const scene = boardScene(track, [], size, 100, false);

    expect(track.walls).toBeNull();
    expect(scene.lines).toHaveLength(4);
    expect(scene.routes.map(({ bold }) => bold)).toEqual([false, true]);
  });

  test('keeps the last maze-like walls when an attempt starts again from a grid', () => {
    const good = followTrack(WAITING, { walls: maze, tried: [] }, size, 0);
    const again = followTrack(good, { walls: closed(size), tried: tried(3) }, size, 10);

    expect(again.walls).toBe(maze);
    expect(boardScene(again, [], size, 10, false)).toEqual({
      size,
      lines: wallLines(maze, size).map((line) => ({ line, shade: 0.6 })),
      routes: [],
    });
  });

  test('names a phase for at least half a second, the attempt count moving freely', () => {
    const routes = at(WAITING, 'board', 1, 0);
    const soon = at(routes, 'filler', 2, PHASE_HOLD - 1);
    const later = at(soon, 'filler', 2, PHASE_HOLD);

    expect([routes.phase, routes.attempt]).toEqual(['routes', 1]);
    expect([soon.phase, soon.attempt]).toEqual(['routes', 2]);
    expect([later.phase, later.phaseSince]).toEqual(['forest', PHASE_HOLD]);
  });

  test('keeps trying another way through every attempt of the fallback', () => {
    const stages = ['fallback', 'board', 'tuned', 'attempt-end', 'board', 'tree'];
    const end = stages.reduce(
      (track, stage, k) => at(track, stage, k, (k + 1) * PHASE_HOLD),
      at(WAITING, 'board', 1, 0)
    );

    expect(end.phase).toBe('another');
  });

  test('keeps the newest routes only, and lets them fade out', () => {
    const track = followTrack(WAITING, { walls: closed(size), tried: tried(20) }, size, 0);

    expect(track.trail).toHaveLength(9);
    expect(track.trail.at(-1)?.cells).toEqual([0, 20]);
    expect(boardScene(track, [], size, ROUTE_FADE / 2, false).routes[0]?.alpha).toBeCloseTo(0.125);
    expect(boardScene(track, [], size, ROUTE_FADE, false).routes).toEqual([]);
  });

  test('shows the wave before the first snapshot', () => {
    const lines = wallLines(maze, size);

    expect(boardScene(WAITING, lines, size, 900, false)).toEqual(
      waveScene(lines, size, 900, false)
    );
  });
});

describe('without motion', () => {
  test('the skeleton is a still dim maze and the board shows no routes', () => {
    const lines = wallLines(decorativeMaze(16, decorativeGoals(16)), 16);
    const still = waveScene(lines, 16, 1234, true);
    const track = followTrack(WAITING, { walls: closed(16), tried: [{ route: [0, 1] }] }, 16, 0);

    expect(still.lines.every(({ shade }) => shade === STILL_SHADE)).toBe(true);
    expect(waveScene(lines, 16, 99_999, true)).toEqual(still);
    expect(boardScene(track, lines, 16, 0, true).routes).toEqual([]);
  });
});

describe('waveShade', () => {
  test('the wave moves a bright band from the start corner to the far one', () => {
    const near = [0, 0, 1, 0] as const;
    const far = [15, 16, 16, 16] as const;
    const early = 0.15 * 1800;

    expect(waveShade(near, 16, early, false)).toBeGreaterThan(waveShade(far, 16, early, false));
    expect(waveShade(far, 16, (0.2 + 31 / 32) * 1800, false)).toBeCloseTo(0.67);
    expect(waveShade(near, 16, (0.2 + 31 / 32) * 1800, false)).toBeCloseTo(0.12);
  });
});
