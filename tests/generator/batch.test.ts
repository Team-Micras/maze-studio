import { describe, expect, test } from 'vitest';

import {
  hasTrap,
  measure,
  pickBatch,
  PRESETS,
  readRecipe,
  savedGrid,
  withMaze,
  type Recipe,
} from '@/generator';
import { setWall } from '@/generator/grid';
import { closedBoard } from '@/generator/rules';

const settings = PRESETS[0].settings;

/** A legal little maze: one corridor from the start up the west column and along to the goal. */
function corridorBoard() {
  const g = closedBoard(16);
  for (let y = 0; y < 7; y++) {
    setWall(g, y * 16, 0, 0);
  }
  for (let x = 0; x < 7; x++) {
    setWall(g, 7 * 16 + x, 1, 0);
  }
  return g;
}

describe('a batch', () => {
  test('saves the walls and goals with a recipe and opens them again', () => {
    const g = corridorBoard();
    const recipe: Recipe = { version: 7, settings, seed: 5 };
    const saved = withMaze(recipe, g);
    expect(saved.walls).toHaveLength(256);
    const read = readRecipe(JSON.stringify({ recipe: saved }));
    expect(read).toEqual(JSON.parse(JSON.stringify(saved)));
    expect(
      read.walls === undefined ? undefined : savedGrid({ ...read, walls: read.walls }).walls
    ).toEqual(g.walls);
  });

  test('refuses recipes that are not one', () => {
    const good = { version: 7, settings, seed: 5 };
    expect(readRecipe(JSON.stringify(good)).seed).toBe(5);
    expect(() => readRecipe('{')).toThrow(SyntaxError);
    expect(() => readRecipe(JSON.stringify({ ...good, walls: 'zz' }))).toThrow('bad recipe');
    expect(() =>
      readRecipe(JSON.stringify({ ...good, settings: { ...settings, loops: [9, 3] } }))
    ).toThrow('bad recipe');
    expect(() => readRecipe(JSON.stringify({ ...good, seed: -1 }))).toThrow('bad recipe');
    expect(() => readRecipe(JSON.stringify({ ...good, hash: 'XYZ' }))).toThrow('bad recipe');
    expect(() => readRecipe(JSON.stringify({ ...good, base: [1, 2], strength: 0.3 }))).toThrow(
      'bad recipe'
    );
    expect(() => readRecipe(JSON.stringify({ recipe: 'x', ...good }))).toThrow('bad recipe');
    expect(() =>
      readRecipe(JSON.stringify({ ...good, settings: { ...settings, straights: 'toString' } }))
    ).toThrow('bad recipe');
    expect(
      readRecipe(JSON.stringify({ ...good, settings: { ...settings, fishboneCells: [4, 6] } }))
        .settings.fishboneCells
    ).toEqual([4, 6]);
  });

  test('measures a maze the generator did not make', () => {
    const { maze, analysis } = measure(corridorBoard());
    expect(maze.width).toBe(16);
    expect(analysis.shortest).toBe(14);
    expect(analysis.choice?.racing).toEqual(analysis.choice?.careful);
    expect(analysis.contest).toBe(false);
    expect(hasTrap(analysis)).toBe(false);
  });

  test('picks the same mazes whatever order the results arrive in', () => {
    const grids = [corridorBoard(), closedBoard(16), corridorBoard()];
    setWall(grids[1], 0, 0, 0);
    const results = grids.map((grid, k) => ({
      grid,
      analysis: measure(grid).analysis,
      seed: 9 - k,
    }));
    expect(pickBatch(results, 2).map((r) => r.seed)).toEqual(
      pickBatch(results.toReversed(), 2).map((r) => r.seed)
    );
  });
});
