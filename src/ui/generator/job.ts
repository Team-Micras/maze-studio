/**
 * What a generator worker does with one message: builds one maze, from a seed (`generate`) or as a
 * variation of a base maze (`vary`), and answers with what the page needs to pick, show and save
 * it, with the targets it missed, which only the worker knows. Kept apart from the worker so
 * that it runs, and is tested, anywhere.
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

/** Builds the maze of `job`. */
export function runJob(job: Job): JobResult {
  const candidate =
    'base' in job
      ? vary(job.settings, job.seed, job.base, job.strength, {}, job.goals)
      : generate(job.settings, job.seed);
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
