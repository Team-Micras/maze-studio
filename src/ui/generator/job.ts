/**
 * What a generator worker does with one message: builds one maze, from a seed (`generate`) or as a
 * variation of a base maze (`vary`), and answers with what the page needs to pick, show and save
 * it, with the targets it missed, which only the worker knows. On the way it reports its progress
 * through the generator's trace, for the loading animations. Kept apart from the worker so that it
 * runs, and is tested, anywhere.
 *
 * @module
 */

import {
  generate,
  relaxedChoice,
  vary,
  type CandidateAnalysis,
  type Grid,
  type Recipe,
  type Settings,
  type Style,
  type Trace,
} from '@/generator';

import { missedTargets } from './misses';

/** One maze to build: from a seed, or a variation of the walls `base` with goal cells `goals`. */
export type Job =
  | { readonly settings: Settings; readonly seed: number }
  | {
      readonly settings: Settings;
      readonly seed: number;
      readonly base: readonly number[];
      readonly strength: number;
      readonly goals?: readonly number[];
    };

/** A maze built, without the flood distances of its analysis. */
export interface JobResult {
  readonly seed: number;
  readonly style: Style;
  readonly recipe: Recipe;
  readonly grid: Grid;
  readonly analysis: CandidateAnalysis;
  /** 0 when every target is met. */
  readonly energy: number;
  /** The route choice was asked with the shorter detour. */
  readonly relaxed: boolean;
  /** The targets it missed, in plain words. */
  readonly misses: readonly string[];
}

/** A route the generator drew and was about to judge: its cells from the start, and its kind. */
export interface TriedRoute {
  readonly route: readonly number[];
  readonly kind: string;
}

/**
 * Where a job is: the walls now, the last few routes tried since the snapshot before, the stage the
 * generator is at and how many boards it has started over on.
 */
export interface JobProgress {
  readonly walls: Uint8Array;
  readonly tried: readonly TriedRoute[];
  readonly stage: string;
  readonly attempt: number;
}

/** What a worker answers a job with: snapshots of its progress, then its result. */
export type JobMessage =
  | { readonly kind: 'progress'; readonly progress: JobProgress }
  | { readonly kind: 'result'; readonly result: JobResult };

/** The least time between two snapshots of the same stage, in milliseconds. */
export const SNAPSHOT_EVERY = 25;

/** The most routes tried a snapshot carries, the newest ones. */
export const TRIED_KEPT = 8;

/**
 * A trace that hands `onProgress` a snapshot at most every {@link SNAPSHOT_EVERY} ms of `now`, and
 * at every change of stage but to `candidate`: routes tried come by the hundred and ride along
 * with the next snapshot.
 */
export function progressTrace(
  onProgress: (progress: JobProgress) => void,
  now: () => number = () => performance.now()
): Trace {
  let last = -Infinity;
  let lastStage = '';
  let tried: TriedRoute[] = [];
  let attempt = 0;

  return (stage, walls, info) => {
    if (stage === 'board') {
      attempt += 1;
    }

    if (stage === 'candidate') {
      const route = info?.route;
      tried.push({
        route: Array.isArray(route) ? route.filter((c) => typeof c === 'number') : [],
        kind: String(info?.kind),
      });
      tried = tried.slice(-TRIED_KEPT);
    }

    const at = now();

    if ((stage !== lastStage && stage !== 'candidate') || at - last >= SNAPSHOT_EVERY) {
      onProgress({ walls: walls.slice(), tried, stage, attempt });
      tried = [];
      last = at;
      lastStage = stage;
    }
  };
}

/** Builds the maze of `job`, telling `onProgress`, if given, how it goes ({@link progressTrace}). */
export function runJob(job: Job, onProgress?: (progress: JobProgress) => void): JobResult {
  const effort = onProgress === undefined ? {} : { trace: progressTrace(onProgress) };
  const candidate =
    'base' in job
      ? vary(job.settings, job.seed, job.base, job.strength, effort, job.goals)
      : generate(job.settings, job.seed, effort);
  const analysis = { ...candidate.analysis };
  Reflect.deleteProperty(analysis, 'dist');
  return {
    seed: candidate.seed,
    style: candidate.style,
    recipe: candidate.recipe,
    grid: candidate.grid,
    analysis,
    energy: candidate.energy,
    relaxed: relaxedChoice(candidate.targets),
    misses: candidate.energy === 0 ? [] : missedTargets(candidate.analysis, candidate.targets),
  };
}
