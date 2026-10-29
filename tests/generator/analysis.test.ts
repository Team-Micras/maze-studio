import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { analyse, fromMaze, type Grid } from '@/generator';
import { pathGeometry } from '@/generator/analysis';
import { BIT, neighbour } from '@/generator/grid';
import { parseMazeText } from '@/maze';

const CLASSIC = join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles', 'classic');

/** The fewest turns among shortest paths, by a forward search over (cell, heading) of its own. */
function fewestTurnsForward(g: Grid): { steps: number; turns: number } | null {
  const goal = new Set(g.goals);
  let layer = new Map([[`${g.start},-1`, 0]]);
  for (let step = 0; step < g.width * g.height; step++) {
    let best = Infinity;
    const next = new Map<string, number>();
    for (const [key, turns] of layer) {
      const [c, h] = key.split(',').map(Number);
      for (let d = 0; d < 4; d++) {
        if (g.walls[c] & BIT[d]) {
          continue;
        }
        const n = neighbour(g, c, d);
        const t = turns + (h >= 0 && h !== d ? 1 : 0);
        if (goal.has(n)) {
          best = Math.min(best, t);
        }
        const k = `${n},${d}`;
        if ((next.get(k) ?? Infinity) > t) {
          next.set(k, t);
        }
      }
    }
    if (best < Infinity) {
      return { steps: step + 1, turns: best };
    }
    layer = next;
  }
  return null;
}

describe('the analysis', () => {
  test('measures turns, straights and zigzags as the corpus does', () => {
    expect(pathGeometry([0, 1, 0, 1, 0, 0])).toEqual({
      turns: 4,
      maxStraight: 2,
      maxDiagonal: 5,
      corners: 0,
      bends: 0,
      hairpins: 0,
      coil: 0,
    });
    const comb = pathGeometry([1, 1, 1, 0, 3, 3, 3, 0, 1, 1, 1, 0, 3, 3, 3]);
    expect([comb.bends, Math.round(comb.corners * 15)]).toEqual([2, 6]);
    const spiral = pathGeometry([1, 1, 1, 0, 0, 0, 3, 3, 2, 2, 1, 1]);
    expect([spiral.bends, spiral.coil]).toEqual([0, 4]);
    const hairpins = pathGeometry([0, 0, 0, 0, 0, 3, 3, 2, 2, 2, 2, 2, 1, 0, 1, 0, 0, 0, 0, 0]);
    expect([hairpins.bends, hairpins.hairpins]).toEqual([0, 3]);
    expect(pathGeometry([1, 0, 1, 0, 1, 0]).corners).toBe(0);
  });

  test('draws a shortest path with the fewest turns on the classic finals', () => {
    const files = readdirSync(CLASSIC).filter((f) => /fin\.txt$|ef\.txt$/.test(f));
    let checked = 0;
    const wrong: string[] = [];
    for (const name of files) {
      const result = parseMazeText(readFileSync(join(CLASSIC, name), 'utf8'), `classic/${name}`);
      if (!result.ok || !result.value.maze.start || result.value.maze.goals.length === 0) {
        continue;
      }
      const g = fromMaze(result.value.maze);
      const a = analyse(g);
      const ref = fewestTurnsForward(g);
      if (!ref) {
        continue;
      }
      const steps = a.path.slice(1).every((c, i) => {
        const d = [0, 1, 2, 3].find((k) => neighbour(g, a.path[i], k) === c);
        return d !== undefined && !(g.walls[a.path[i]] & BIT[d]);
      });
      const end = a.path.at(-1);
      if (
        a.path.length - 1 !== a.shortest ||
        end === undefined ||
        !g.goals.includes(end) ||
        !steps
      ) {
        wrong.push(`${name}: the drawn path is no path to the goal`);
      }
      if (a.shortest !== ref.steps || a.turns !== ref.turns) {
        wrong.push(
          `${name}: ${a.shortest} cells ${a.turns} turns, not ${ref.steps} and ${ref.turns}`
        );
      }
      checked++;
    }
    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(25);
  }, 60_000);
});
