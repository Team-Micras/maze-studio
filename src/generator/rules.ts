/**
 * Board rules shared by the generator stages: the closed board with its goal block and, on some
 * half-size boards, a walled-off open area, the start that opens north only, the post rule and the
 * cycle a new opening closes.
 *
 * @module
 */

import { bfs, isOpen, neighbour, setWall, type Grid } from './grid';

/** An edge as the cell inside and the direction out of it. */
export type CellEdge = [cell: number, direction: number];

/** The 2 × 2 goal in the middle of the board. */
export function centreGoal(size: number): number[] {
  const m = size / 2 - 1;
  return [m * size + m, m * size + m + 1, (m + 1) * size + m, (m + 1) * size + m + 1];
}

/**
 * A board with every wall closed, the start in `(0, 0)` and the goal block opened inside: the
 * 2 × 2 in the middle unless other goal cells are given. A `room` (1 per cell) is opened inside
 * too and stays walled off from the maze: the dead regions of the half-size finals, which hold
 * their only bare posts; `closed` counts its cells, the cells that may not reach the goal.
 *
 * @param goals A square block.
 */
export function closedBoard(
  size: number,
  goals: readonly number[] = centreGoal(size),
  room: Uint8Array | null = null
): Grid {
  const g: Grid = {
    width: size,
    height: size,
    walls: new Uint8Array(size * size).fill(15),
    start: 0,
    goals,
    room,
    closed: room ? room.reduce((n, v) => n + v, 0) : 0,
  };
  const inside = new Set(goals);
  for (const c of goals) {
    for (const d of [0, 1]) {
      if (inside.has(neighbour(g, c, d))) {
        setWall(g, c, d, 0);
      }
    }
  }
  if (room) {
    for (let c = 0; c < size * size; c++) {
      for (const d of [0, 1]) {
        if (room[c] && room[neighbour(g, c, d)]) {
          setWall(g, c, d, 0);
        }
      }
    }
  }
  return g;
}

/** The centre of the goal block and half its side less half a cell: 0.5 for 2 × 2, 1 for 3 × 3. */
export function goalCentre(g: Grid): [x: number, y: number, half: number] {
  const xs = g.goals.map((c) => c % g.width);
  const ys = g.goals.map((c) => Math.floor(c / g.width));
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
    (Math.max(...xs) - Math.min(...xs)) / 2,
  ];
}

/** The edges of the goal perimeter, as `[cell inside, direction out]`. */
export function goalPerimeter(g: Grid): CellEdge[] {
  const inside = new Set(g.goals);
  const out: CellEdge[] = [];
  for (const c of g.goals) {
    for (let d = 0; d < 4; d++) {
      const n = neighbour(g, c, d);
      if (n >= 0 && !inside.has(n)) {
        out.push([c, d]);
      }
    }
  }
  return out;
}

/** The open doors of the goal: edges of its perimeter without a wall. */
export const doorCount = (g: Grid): number =>
  goalPerimeter(g).filter(([c, d]) => isOpen(g, c, d)).length;

/** Whether `(c, d)` is the start's east wall, which stays, so the start opens to the north only. */
export const isStartEast = (c: number, d: number): boolean =>
  (c === 0 && d === 1) || (c === 1 && d === 3);

/**
 * Whether the post at the north end (`d` 1, east edge) or the east end (`d` 0, north edge) of the
 * edge, or at its other end, has no wall left. The posts inside the goal block may be bare.
 */
export function bareEndPost(g: Grid, c: number, d: number): boolean {
  const w = g.width;
  const x = c % w;
  const y = Math.floor(c / w);
  const ends =
    d === 0
      ? [
          [x, y + 1],
          [x + 1, y + 1],
        ]
      : [
          [x + 1, y],
          [x + 1, y + 1],
        ];
  for (const [px, py] of ends) {
    if (px <= 0 || py <= 0 || px >= w || py >= g.height) {
      continue;
    }
    const sw = (py - 1) * w + px - 1;
    const ne = py * w + px;
    if (
      g.goals.includes(sw) &&
      g.goals.includes(ne) &&
      g.goals.includes(sw + 1) &&
      g.goals.includes(ne - 1)
    ) {
      continue;
    }
    if (isOpen(g, sw, 0) && isOpen(g, sw, 1) && isOpen(g, ne, 2) && isOpen(g, ne, 3)) {
      return true;
    }
  }
  return false;
}

/** The length of the cycle that opening the wall between `a` and `b` would close. */
export function cycleLength(g: Grid, a: number, b: number): number {
  const { dist } = bfs(g, [a], { stop: b });
  return dist[b] >= 0 ? dist[b] + 1 : Infinity;
}
