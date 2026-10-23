/**
 * Batches of generated mazes for the Generate dialog (the mockup's `batch.js`): each batch builds
 * {@link POOL_FACTOR} times as many seeds as it shows, in up to four workers sharing a queue, and
 * keeps the most varied ({@link pickBatch}); a pasted recipe rebuilds its maze. One run at a time:
 * starting another, or cancelling, terminates the workers and drops the mazes still pending.
 *
 * @module
 */

import {
  BATCH,
  GENERATOR_VERSION,
  isSettings,
  pickBatch,
  POOL_FACTOR,
  savedGrid,
  TUNING,
  withMaze,
  type CandidateAnalysis,
  type Grid,
  type SavedRecipe,
  type Settings,
  type Style,
} from '@/generator';

import type { Job, JobResult } from './job';

/** A maze of the batch, numbered from 1 in the order it was asked for. */
export interface Item {
  readonly n: number;
  /** A seed of a batch, or rebuilt from a recipe. */
  readonly origin: 'seed' | 'loaded';
  readonly status: 'pending' | 'ready' | 'failed';
  /** Known once its batch is picked. */
  readonly seed?: number;
  readonly style?: Style;
  /** What rebuilds it, with the walls and goal cells it made. */
  readonly recipe?: SavedRecipe;
  /** 0 within every target, `null` when not measured (the walls an older recipe saved). */
  readonly energy?: number | null;
  /** The route choice was asked with the shorter detour. */
  readonly relaxed?: boolean;
  /** The version of the older generator whose recipe it was opened from. */
  readonly older?: number;
  /** Opened from the walls that older recipe saved rather than rebuilt. */
  readonly saved?: boolean;
  /** The wall hash the recipe it was rebuilt from saved. */
  readonly hash?: string;
  /** Rebuilt from a recipe of this generator into walls of another hash than it saved. */
  readonly mismatch?: boolean;
  readonly grid?: Grid;
  readonly analysis?: CandidateAnalysis;
}

/** What the batch holds and shows. */
export interface BatchState {
  readonly items: readonly Item[];
  /** Mazes built of the run on its way, if one is. */
  readonly progress: { readonly done: number; readonly total: number } | null;
  /** The first seed of the last batch, and the seed the next one starts from. */
  readonly firstSeed: number;
  readonly nextSeed: number;
  /** Whether a worker failed in the last run, leaving some mazes out. */
  readonly stopped: boolean;
}

/** A worker as the batch drives it. */
export interface Runner {
  readonly post: (job: Job) => void;
  readonly terminate: () => void;
}

/** Starts a worker that answers each job with `onResult`, or calls `onError` when it fails. */
export type Spawn = (onResult: (result: JobResult) => void, onError: () => void) => Runner;

/** Starts a generator worker of the build, in its own chunk. */
export const spawnWorker: Spawn = (onResult, onError) => {
  const worker = new Worker(new URL('./generator-worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<JobResult>) => onResult(event.data));
  worker.addEventListener('error', (event) => {
    event.preventDefault();
    onError();
  });
  return { post: (job) => worker.postMessage(job), terminate: () => worker.terminate() };
};

/** Workers a run starts: one fewer than the cores, from one to four. */
export const workerCount = (cores: number | undefined): number =>
  Math.max(1, Math.min(4, (cores ?? 2) - 1));

/** The largest first seed. */
export const MAX_SEED = 0xffffffff;

/** What a batch runs on; the browser's workers and a random first seed by default. */
export interface BatchOptions {
  readonly spawn?: Spawn;
  readonly workers?: number;
  /** Mazes a batch shows. */
  readonly size?: number;
  readonly firstSeed?: number;
}

interface Run {
  readonly runners: Runner[];
  readonly items: readonly Item[];
}

/** The mazes generated so far, in the order they were asked for. */
export class Batch {
  readonly #spawn: Spawn;
  readonly #workers: number;
  readonly #size: number;
  readonly #listeners = new Set<() => void>();
  #state: BatchState;
  #run: Run | undefined;

  constructor(options: BatchOptions = {}) {
    this.#spawn = options.spawn ?? spawnWorker;
    this.#workers = options.workers ?? workerCount(globalThis.navigator?.hardwareConcurrency);
    this.#size = options.size ?? BATCH;
    const seed = options.firstSeed ?? 1 + Math.floor(Math.random() * 9999);
    this.#state = { items: [], progress: null, firstSeed: seed, nextSeed: seed, stopped: false };
  }

  /** The batch now; a new object after every change. */
  readonly getState = (): BatchState => this.#state;

  /**
   * Calls `listener` after every change.
   *
   * @returns What stops listening.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Sets the seed the next batch starts from, a whole number from 0 to {@link MAX_SEED}. */
  setNextSeed(seed: number): void {
    this.#set({ nextSeed: Math.min(MAX_SEED, Math.max(0, Math.round(seed) || 0)) });
  }

  /** Stops the run on its way, if any, and drops the mazes it had not built. */
  cancel(): void {
    const run = this.#run;

    if (run === undefined) {
      return;
    }

    for (const runner of run.runners) {
      runner.terminate();
    }

    this.#run = undefined;
    this.#set({
      items: this.#state.items.filter((item) => !run.items.includes(item)),
      progress: null,
    });
  }

  /** A batch from the next seeds; with `fresh`, it replaces the mazes so far. */
  generate(settings: Settings, fresh: boolean): readonly Item[] {
    this.cancel();
    const first = this.#state.nextSeed;
    const total = this.#size * POOL_FACTOR;
    const kept = fresh ? [] : this.#state.items;
    const items = Array.from({ length: this.#size }, (_, k) =>
      pending(kept.length + k + 1, 'seed')
    );
    this.#set({
      items: [...kept, ...items],
      firstSeed: first,
      nextSeed: Math.min(MAX_SEED, first + total),
    });
    this.#start(
      Array.from({ length: total }, (_, k) => ({ settings, seed: first + k })),
      items
    );
    return items;
  }

  /**
   * The maze of a recipe read by `readRecipe`. A recipe of this generator rebuilds from its own
   * settings alone. A recipe of an older generator opens the walls it saved; one without them is
   * rebuilt with `settings` filling the switches it lacks, and marked `older`, as the maze differs.
   */
  rebuild(recipe: SavedRecipe, settings: Settings): Item {
    this.cancel();
    const version = recipe.version;
    const older = version === GENERATOR_VERSION ? undefined : version;
    const n = this.#state.items.length + 1;

    if (older !== undefined && recipe.walls !== undefined) {
      const item: Item = {
        n,
        origin: 'loaded',
        status: 'ready',
        seed: recipe.seed,
        recipe,
        energy: null,
        older,
        saved: true,
        grid: savedGrid({ ...recipe, walls: recipe.walls }),
      };
      this.#set({ items: [...this.#state.items, item] });
      return item;
    }

    const item: Item = { ...pending(n, 'loaded'), older, hash: recipe.hash };
    this.#set({ items: [...this.#state.items, item] });
    const own = older === undefined ? recipe.settings : olderSettings(recipe.settings, settings);
    this.#start(
      [
        recipe.base === undefined
          ? { settings: own, seed: recipe.seed }
          : {
              settings: own,
              seed: recipe.seed,
              base: recipe.base,
              strength: recipe.strength ?? 0,
              goals: recipe.goals,
            },
      ],
      [item]
    );
    return item;
  }

  #set(changes: Partial<BatchState>): void {
    this.#state = { ...this.#state, ...changes };

    for (const listener of this.#listeners) {
      listener();
    }
  }

  #start(jobs: readonly Job[], items: readonly Item[]): void {
    const queue = [...jobs];
    const results: JobResult[] = [];
    const runners: Runner[] = [];
    const run: Run = { runners, items };
    let open = jobs.length;
    this.#run = run;
    this.#set({ progress: { done: 0, total: jobs.length }, stopped: false });

    const finish = (): void => {
      open -= 1;

      if (this.#run !== run || open > 0) {
        return;
      }

      const picked = pickBatch(results, items.length);
      const filled = new Map(items.map((item, k) => [item, filledItem(item, picked[k])]));

      for (const runner of runners) {
        runner.terminate();
      }

      this.#run = undefined;
      this.#set({
        items: this.#state.items.map((item) => filled.get(item) ?? item),
        progress: null,
      });
    };

    const post = (runner: Runner): void => {
      const job = queue.shift();

      if (job !== undefined) {
        runner.post(job);
      }
    };

    for (let k = 0; k < Math.min(this.#workers, jobs.length); k++) {
      const runner: Runner = this.#spawn(
        (result) => {
          if (this.#run !== run) {
            return;
          }

          results.push(result);
          const progress = this.#state.progress;
          this.#set({
            progress: progress === null ? null : { ...progress, done: progress.done + 1 },
          });
          post(runner);
          finish();
        },
        () => {
          if (this.#run !== run) {
            return;
          }

          this.#set({ stopped: true });

          for (let left = 1 + queue.splice(0).length; left > 0; left--) {
            finish();
          }
        }
      );
      runners.push(runner);
      post(runner);
    }
  }
}

function pending(n: number, origin: Item['origin']): Item {
  return { n, origin, status: 'pending' };
}

function filledItem(item: Item, result: JobResult | undefined): Item {
  if (result === undefined) {
    return { ...item, status: 'failed' };
  }

  return {
    ...item,
    status: 'ready',
    seed: result.seed,
    style: result.style,
    recipe: withMaze(result.recipe, result.grid),
    energy: result.energy,
    relaxed: result.relaxed,
    analysis: result.analysis,
    grid: result.grid,
    mismatch:
      item.hash !== undefined && item.older === undefined && item.hash !== result.recipe.hash,
  };
}

/**
 * The settings an older recipe rebuilds with: the fields it holds that this generator knows, over
 * the form's switches; its own settings when that mix does not check.
 */
function olderSettings(recipe: Settings, form: Settings): Settings {
  const tuning: readonly string[] = TUNING;
  const known = (key: string): boolean => key in form || tuning.includes(key);
  const merged: unknown = {
    ...Object.fromEntries(Object.entries(form).filter(([key]) => !tuning.includes(key))),
    ...Object.fromEntries(Object.entries(recipe).filter(([key]) => known(key))),
  };
  return isSettings(merged) ? merged : recipe;
}
