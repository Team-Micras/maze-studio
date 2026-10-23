/**
 * The pure side of a batch of generated mazes: how many a batch shows and generates, the pick of
 * the most varied, recipes saved with the maze they made and read back from pasted text, and the
 * numbers a card of a maze shows.
 *
 * @module
 */

import type { Maze } from '@/maze';

import { analyse } from './analysis';
import { pickDiverse, type CandidateAnalysis, type Pickable } from './diversity';
import { LEVELS, isContest, type Recipe } from './generator';
import { toMaze, type Grid } from './grid';
import { routeChoice, shortestCost } from './racing';
import { closedBoard } from './rules';
import { searchRun } from './search';
import { sensor } from './sensor';
import type { Analysis, Settings } from './types';

/** Mazes a batch shows. */
export const BATCH = 8;

/** Variations "More like this" shows. */
export const LIKE = 4;

/** How far a variation may move from its parent, 0 to 1. */
export const LIKE_STRENGTH = 0.3;

/** Mazes generated per maze shown: the batch shows the most varied of them. */
export const POOL_FACTOR = 3;

/** The least loss, in %, of a robot that explores little before its route is worth drawing. */
export const TRAP_SHOWN = 5;

/** The fine tuning fields of the settings, left out while they hold the generator's defaults. */
export const TUNING = [
  'deadEnds',
  'corridors',
  'racingGain',
  'carefulLoss',
  'trapLoss',
  'zigzagCells',
  'dashedCells',
  'fishboneCells',
] as const;

/**
 * A recipe with the maze it made, walls as one hex digit per cell (the mazefiles bitmask) and the
 * goal cells, so a later generator that builds another maze from the same seed still opens it.
 */
export interface SavedRecipe extends Recipe {
  readonly walls?: string;
}

/** A recipe with the maze it made ({@link SavedRecipe}). */
export const withMaze = (recipe: Recipe, grid: Grid): SavedRecipe => ({
  ...recipe,
  walls: Array.from(grid.walls, (w) => w.toString(16)).join(''),
  goals: grid.goals,
});

/** The grid of the maze a recipe saved. */
export function savedGrid(recipe: SavedRecipe & { readonly walls: string }): Grid {
  const board = closedBoard(recipe.settings.size);
  return {
    ...board,
    walls: Uint8Array.from(recipe.walls, (h) => Number.parseInt(h, 16)),
    goals: recipe.goals ?? board.goals,
  };
}

const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isFraction = (v: unknown) => v === undefined || (typeof v === 'number' && v >= 0 && v <= 1);
const isShare = (v: unknown) => typeof v === 'boolean' || isFraction(v);
const isRange = (v: unknown, hi: number) =>
  Array.isArray(v) && v.length === 2 && isInt(v[0], 0, hi) && isInt(v[1], v[0], hi);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Whether `s` is settings fit to reach the generator: every field it reads has its shape. */
export function isSettings(s: unknown): s is Settings {
  if (!isRecord(s) || (s.size !== 16 && s.size !== 32)) {
    return false;
  }
  const size = s.size;
  const { path, loops, shortestLoses } = s;
  return (
    Array.isArray(path) &&
    path.length === 2 &&
    isInt(path[0], 1, 9999) &&
    isInt(path[1], path[0], 9999) &&
    Array.isArray(loops) &&
    loops.length === 2 &&
    loops.every((v) => isInt(v, 0, 9999)) &&
    loops[0] <= loops[1] &&
    (['straights', 'diagonals'] as const).every((k) => {
      const v = s[k];
      return Array.isArray(v)
        ? isRange(v, 3 * size)
        : typeof v === 'string' && Object.hasOwn(LEVELS[size][k], v);
    }) &&
    TUNING.every(
      (k) => s[k] === undefined || (k === 'trapLoss' ? isInt(s[k], 1, 100) : isRange(s[k], 100))
    ) &&
    isShare(s.choice) &&
    [s.trap, s.zigzag, s.dashed, s.fishbone].every((v) => v === undefined || isShare(v)) &&
    ['symmetric', 'westStart', 'twoDoors'].every((k) => isFraction(s[k])) &&
    (s.ties === undefined || isInt(s.ties, 0, 20)) &&
    [s.follower, s.contest].every((v) => v === undefined || typeof v === 'boolean') &&
    (s.scoring === undefined || s.scoring === 'best' || s.scoring === 'search') &&
    (s.goal === undefined || s.goal === 2 || s.goal === 3) &&
    (s.room === undefined || (typeof s.room === 'number' && s.room >= 0 && s.room <= 0.3)) &&
    (shortestLoses === undefined ||
      (isRecord(shortestLoses) &&
        Object.entries(shortestLoses).every(
          ([k, v]) => ['orthogonal', 'diagonal', 'both'].includes(k) && isFraction(v)
        ))) &&
    isFraction(s.classFlip)
  );
}

function isSavedRecipe(r: unknown): r is SavedRecipe {
  if (!isRecord(r) || !isSettings(r.settings)) {
    return false;
  }
  const cells = r.settings.size * r.settings.size;
  const { walls, goals, base } = r;
  return (
    isInt(r.seed, 0, 0xffffffff) &&
    (r.version === undefined || isInt(r.version, 1, 999)) &&
    (r.hash === undefined || (typeof r.hash === 'string' && /^[0-9a-f]{8}$/.test(r.hash))) &&
    (walls === undefined ||
      (typeof walls === 'string' && walls.length === cells && /^[0-9a-f]+$/.test(walls))) &&
    (goals === undefined ||
      (Array.isArray(goals) &&
        goals.length >= 1 &&
        goals.length <= 9 &&
        goals.every((c) => isInt(c, 0, cells - 1)))) &&
    (base === undefined ||
      (Array.isArray(base) &&
        base.length === cells &&
        base.every((v) => isInt(v, 0, 15)) &&
        typeof r.strength === 'number' &&
        r.strength >= 0 &&
        r.strength <= 1))
  );
}

/**
 * Reads a pasted recipe, or a candidate holding one, checking every field before it reaches the
 * generator.
 *
 * @throws {SyntaxError} When the text is not JSON.
 * @throws {Error} When the recipe is not one.
 */
export function readRecipe(text: string): SavedRecipe {
  const data: unknown = JSON.parse(text);
  const r = isRecord(data) ? (data.recipe ?? data) : data;
  if (!isSavedRecipe(r)) {
    throw new Error('bad recipe');
  }
  return r;
}

/**
 * The most varied `count` of a batch's results: sorted by seed first, so the same settings and
 * first seed give the same mazes in the same order on every computer, whatever order the workers
 * finish in.
 */
export function pickBatch<C extends Pickable & { readonly seed: number }>(
  results: readonly C[],
  count: number
): C[] {
  return pickDiverse(
    results.toSorted((a, b) => a.seed - b.seed),
    count
  );
}

/** The numbers a card of a maze shows, with its flood distances. */
export interface Measured {
  readonly maze: Maze;
  readonly grid: Grid;
  readonly analysis: Analysis;
}

/**
 * The numbers of a maze with the flood distances. The route choice, the search trap, the sensor
 * motifs and "shortest is not fastest" come from the generator's analysis when it measured them;
 * whether the maze is a contest is measured here, on every maze, as the tags show it.
 */
export function measure(grid: Grid, given?: CandidateAnalysis): Measured {
  const a: Analysis = analyse(grid);
  if (given?.search) {
    Object.assign(a, { choice: given.choice, trap: given.trap, search: given.search });
  } else if (a.shortest >= 0) {
    a.choice = routeChoice(grid);
    if (a.choice) {
      const run = searchRun(grid, a.choice.racingTime);
      Object.assign(a, { trap: run.loss, search: run.route });
    }
  }
  if (a.choice) {
    a.contest = isContest(grid, a.choice);
  }
  a.sensor =
    given?.sensor ?? (a.choice ? sensor(grid, a.choice.racing, a.choice.careful) : undefined);
  if (given?.slow) {
    a.slow = given.slow;
  } else if (a.choice) {
    const mid = shortestCost(grid, 'mid', {
      orthogonal: a.choice.careful,
      diagonal: a.choice.racing,
    });
    a.slow = mid ? { mid } : undefined;
  }
  return { maze: toMaze(grid), grid, analysis: a };
}

/** Whether the quick explorer's route costs enough to be worth drawing. */
export const hasTrap = (a: Pick<Analysis, 'trap' | 'search'>): boolean =>
  (a.trap ?? Number.NaN) >= TRAP_SHOWN && (a.search?.length ?? 0) > 1;
