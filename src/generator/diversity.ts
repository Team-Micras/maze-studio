/**
 * The features of a maze and the pick of a varied batch: the room compares candidates side by side,
 * so a batch must not show the same maze twice under different seeds.
 *
 * @module
 */

import { analyse, symmetry } from './analysis';
import type { Grid } from './grid';
import { routeChoice } from './racing';
import { searchRun } from './search';
import type { Analysis, Style } from './types';

/** A small feature vector of a maze. */
export interface Signature {
  /** The generation style, null for a maze that was not generated. */
  readonly style: Style | null;
  /** The shortest path in cells. */
  readonly path: number;
  /** Turns on the drawn shortest path. */
  readonly turns: number;
  /** The longest straight on the racing route (the diagonal robot's fastest). */
  readonly straight: number;
  /** The longest zigzag on the racing route. */
  readonly diagonal: number;
  readonly loops: number;
  /** The route choice strength, %: the lesser of the racing gain and the careful loss. */
  readonly choice: number;
  /** The longest stretch of the racing route off the careful one, %. */
  readonly detour: number;
  /** The search trap, %. */
  readonly trap: number;
  /** The share of the walls that the mirror along the start-goal diagonal keeps, 0 to 1. */
  readonly symmetry: number;
  /** The share of the racing route on the outer ring of cells, 0 to 1. */
  readonly edge: number;
  /** The sides of the goal that open, as 'N', 'E', 'S', 'W'. */
  readonly door: string;
}

/** The analysis of a candidate, with or without the flood distances. */
export type CandidateAnalysis = Analysis | Omit<Analysis, 'dist'>;

/**
 * The signature of a maze. Takes the route choice and the trap from the analysis when there, else
 * measures them, so it also works on a maze edited by hand.
 */
export function signature(grid: Grid, analysis: CandidateAnalysis = analyse(grid)): Signature {
  const c = analysis.choice ?? routeChoice(grid);
  const w = grid.width;
  const goal = new Set(grid.goals);
  const rim = (cell: number) =>
    cell % w === 0 || cell % w === w - 1 || cell < w || cell >= w * (w - 1);
  let door = '';
  for (const g of grid.goals) {
    const steps: [number, number][] = [
      [0, g + w],
      [1, g + 1],
      [2, g - w],
      [3, g - 1],
    ];
    for (const [d, n] of steps) {
      if (!(grid.walls[g] & (1 << d)) && !goal.has(n)) {
        door += 'NESW'[d];
      }
    }
  }
  return {
    style: analysis.style ?? null,
    path: analysis.shortest,
    turns: analysis.turns,
    straight: c ? c.racingShape.maxStraight : analysis.maxStraight,
    diagonal: c ? c.racingShape.maxDiagonal : analysis.maxDiagonal,
    loops: analysis.loops,
    choice: c && c.racingGain >= 3 ? Math.max(0, Math.min(c.racingGain, c.carefulLoss)) : 0,
    detour: c ? 100 * c.detour : 0,
    trap: analysis.trap ?? (c ? searchRun(grid, c.racingTime).loss : 0),
    symmetry: symmetry(grid),
    edge: c ? c.racing.filter(rim).length / c.racing.length : 0,
    door,
  };
}

type Scaled =
  | 'path'
  | 'turns'
  | 'straight'
  | 'diagonal'
  | 'loops'
  | 'choice'
  | 'detour'
  | 'trap'
  | 'symmetry'
  | 'edge';

const SCALE: readonly (readonly [Scaled, number])[] = [
  ['path', 8],
  ['turns', 8],
  ['straight', 3],
  ['diagonal', 3],
  ['loops', 5],
  ['choice', 5],
  ['detour', 25],
  ['trap', 8],
  ['symmetry', 0.08],
  ['edge', 0.15],
];

/** The distance between two signatures: scaled features, plus 1 for another style and 0.5 for another goal door. */
export function distance(a: Signature, b: Signature): number {
  let sum = 0;
  for (const [k, scale] of SCALE) {
    const x = (a[k] - b[k]) / scale;
    sum += x * x;
  }
  return Math.sqrt(sum) + (a.style !== b.style ? 1 : 0) + (a.door !== b.door ? 0.5 : 0);
}

const wallsApart = (a: Grid, b: Grid) =>
  a.walls.reduce((n, w, i) => n + (w !== b.walls[i] ? 1 : 0), 0) / a.walls.length;

const NEAR = 0.08;

/** What {@link pickDiverse} picks from. */
export interface Pickable {
  readonly grid: Grid;
  readonly analysis: CandidateAnalysis;
  readonly energy?: number;
  readonly seed?: number;
}

/**
 * A varied batch of `n` from `candidates`: those within targets first, then the rest. Each next
 * one is the farthest, by {@link distance}, from those already picked, with a bonus of 2 for a
 * style not shown yet; no style takes more than its share of the batch (n over the styles on
 * offer, rounded up) while another style can fill the place, and near-duplicates (fewer than 8 % of
 * the cells with other walls) are left out. The result does not depend on the order the
 * candidates arrive in: ties go to the lower seed, else the input order. At most n, in pick order.
 */
export function pickDiverse<C extends Pickable>(candidates: readonly C[], n: number): C[] {
  const pool = candidates.map((c, i) => ({
    c,
    key: c.seed ?? i,
    sig: signature(c.grid, c.analysis),
    within: (c.energy ?? 0) === 0,
  }));
  pool.sort((a, b) => Number(b.within) - Number(a.within) || a.key - b.key);
  const share = Math.ceil(n / new Set(pool.map((p) => p.sig.style)).size);
  const picked: (typeof pool)[number][] = [];
  const shown = (style: Style | null) => picked.filter((q) => q.sig.style === style).length;
  while (picked.length < n) {
    let best: (typeof pool)[number] | null = null;
    let bestScore = -Infinity;
    for (const capped of [true, false]) {
      for (const p of pool) {
        if (picked.includes(p) || picked.some((q) => wallsApart(p.c.grid, q.c.grid) < NEAR)) {
          continue;
        }
        if (capped && shown(p.sig.style) >= share) {
          continue;
        }
        if (best && best.within && !p.within) {
          break;
        }
        const near = picked.length ? Math.min(...picked.map((q) => distance(p.sig, q.sig))) : 0;
        const score = near + (shown(p.sig.style) ? 0 : 2);
        if (score > bestScore) {
          [best, bestScore] = [p, score];
        }
      }
      if (best) {
        break;
      }
    }
    if (!best) {
      break;
    }
    picked.push(best);
  }
  return picked.map((p) => p.c);
}
