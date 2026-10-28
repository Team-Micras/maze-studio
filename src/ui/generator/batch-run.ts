/**
 * Batches of generated mazes for the Generate dialog (the mockup's `batch.js`): each batch builds
 * {@link BATCH} seeds in a row, in up to four workers sharing a queue, each maze shown in its seed's
 * card as soon as it is built, and each pending maze's progress kept as a {@link LoadingTrack} for
 * the board's animation; a pasted recipe rebuilds its maze. One run at a time:
 * starting another, or cancelling, terminates the workers and drops the mazes still pending.
 *
 * @module
 */

import {
  BATCH,
  GENERATOR_VERSION,
  isSettings,
  savedGrid,
  TUNING,
  withMaze,
  type CandidateAnalysis,
  type Grid,
  type SavedRecipe,
  type Settings,
  type Style,
} from '@/generator';
import { followTrack, WAITING, type LoadingTrack } from '@/render';

import type { Job, JobProgress, JobResult, JobMessage } from './job';

/**
 * A maze of the batch: `n` tells it apart, never given twice by one batch; the dialog calls it by
 * its place in the list.
 */
export interface Item {
  readonly n: number;
  /** A seed of a batch, or rebuilt from a recipe. */
  readonly origin: 'seed' | 'loaded';
  readonly status: 'pending' | 'ready' | 'failed';
  /** The side of its board, in cells. */
  readonly size: 16 | 32;
  /** When a worker built it, on the batch's clock: the skeleton crossfades into it from then. */
  readonly builtAt?: number;
  /** The seed it is built from; known once it is built. */
  readonly seed?: number;
  readonly style?: Style;
  /** What rebuilds it, with the walls and goal cells it made. */
  readonly recipe?: SavedRecipe;
  /** 0 within every target, `null` when not measured (the walls an older recipe saved). */
  readonly energy?: number | null;
  /** The route choice was asked with the shorter detour. */
  readonly relaxed?: boolean;
  /** The targets it missed, in plain words, when its energy is not 0. */
  readonly misses?: readonly string[];
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
  /**
   * The first and last seeds of the batch, More after More, once one ran: `undefined` once its
   * seeds are no longer one run, as after a new first seed or the wrap at the top of the range.
   */
  readonly seeds: { readonly first: number; readonly last: number } | null | undefined;
  /** The seed the next batch starts from. */
  readonly nextSeed: number;
  /** Whether a worker failed in the last run, leaving some mazes out. */
  readonly stopped: boolean;
}

/** A worker as the batch drives it. */
export interface Runner {
  readonly post: (job: Job) => void;
  readonly terminate: () => void;
}

/**
 * Starts a worker that answers each job with `onResult`, after snapshots of its progress to
 * `onProgress`, or calls `onError` when it fails.
 */
export type Spawn = (
  onResult: (result: JobResult) => void,
  onError: () => void,
  onProgress: (progress: JobProgress) => void
) => Runner;

/** Starts a generator worker of the build, in its own chunk. */
export const spawnWorker: Spawn = (onResult, onError, onProgress) => {
  const worker = new Worker(new URL('./generator-worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }: MessageEvent<JobMessage>) => {
    if (data.kind === 'progress') {
      onProgress(data.progress);
    } else {
      onResult(data.result);
    }
  });
  worker.addEventListener('error', (event) => {
    event.preventDefault();
    onError();
  });
  return { post: (job) => worker.postMessage(job), terminate: () => worker.terminate() };
};

/** Workers a run starts: one fewer than the cores, from one to four. */
export const workerCount = (cores: number | undefined): number =>
  Math.max(1, Math.min(4, (cores ?? 2) - 1));

/** The most mazes one batch holds, More after More; a new batch starts again from none. */
export const MAX_ITEMS = 64;

/** The largest seed a recipe allows. */
export const MAX_SEED = 0xffffffff;

/**
 * A random seed from 0 to `max`, drawn over the whole 32-bit range so that no small set of seeds
 * can be built ahead of a contest; `fill` is the browser's `crypto.getRandomValues` by default.
 */
export function randomSeed(
  max: number,
  fill: (values: Uint32Array<ArrayBuffer>) => void = (values) => {
    crypto.getRandomValues(values);
  }
): number {
  const values = new Uint32Array(1);
  fill(values);
  return Math.min(max, values[0] ?? 0);
}

/** What a batch runs on; the browser's workers and a random first seed by default. */
export interface BatchOptions {
  readonly spawn?: Spawn;
  readonly workers?: number;
  /** Mazes a batch shows. */
  readonly size?: number;
  readonly firstSeed?: number;
  /** The clock of the tracks and of `builtAt`, in milliseconds; `performance.now` by default. */
  readonly now?: () => number;
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
  readonly #now: () => number;
  readonly #tracks = new Map<number, LoadingTrack>();
  #numbered = 0;
  #state: BatchState;
  #run: Run | undefined;

  constructor(options: BatchOptions = {}) {
    this.#spawn = options.spawn ?? spawnWorker;
    this.#workers = options.workers ?? workerCount(globalThis.navigator?.hardwareConcurrency);
    this.#size = options.size ?? BATCH;
    this.#now = options.now ?? (() => performance.now());
    const seed = options.firstSeed ?? randomSeed(MAX_SEED - this.#size + 1);
    this.#state = {
      items: [],
      progress: null,
      seeds: null,
      nextSeed: seed,
      stopped: false,
    };
  }

  /**
   * What the maze numbered `n` has shown of its progress so far; it changes without a call to the
   * listeners, as often as the workers send snapshots, for an animation to read every frame.
   */
  readonly track = (n: number): LoadingTrack => this.#tracks.get(n) ?? WAITING;

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

  /**
   * The largest first seed, so that every seed of a batch stays within {@link MAX_SEED}, which a
   * recipe allows.
   */
  get maxSeed(): number {
    return MAX_SEED - this.#size + 1;
  }

  /** Sets the seed the next batch starts from, a whole number from 0 to {@link maxSeed}. */
  setNextSeed(seed: number): void {
    this.#set({ nextSeed: Math.min(this.maxSeed, Math.max(0, Math.round(seed) || 0)) });
  }

  /** Stops the run on its way, if any, and drops the mazes it had not built yet. */
  cancel(): void {
    const run = this.#run;

    if (run === undefined) {
      return;
    }

    for (const runner of run.runners) {
      runner.terminate();
    }

    this.#run = undefined;
    const dropped = (item: Item) =>
      item.status === 'pending' && run.items.some(({ n }) => n === item.n);

    for (const item of this.#state.items.filter(dropped)) {
      this.#tracks.delete(item.n);
    }

    this.#set({
      items: this.#state.items.filter((item) => !dropped(item)),
      progress: null,
    });
  }

  /** Whether {@link MAX_ITEMS} leaves room for another {@link generate} that keeps the mazes so far. */
  get roomForMore(): boolean {
    return this.#state.items.length + this.#size <= MAX_ITEMS;
  }

  /**
   * The next seeds' mazes: with `fresh` in place of the mazes so far, else after them, while
   * {@link roomForMore} allows.
   */
  generate(settings: Settings, fresh: boolean): readonly Item[] {
    this.cancel();

    if (!fresh && !this.roomForMore) {
      return [];
    }

    if (fresh) {
      this.#tracks.clear();
    }

    const first = this.#state.nextSeed;
    const kept = fresh ? [] : this.#state.items;
    const shown = fresh ? null : (this.#state.seeds ?? undefined);
    const items = Array.from({ length: this.#size }, () =>
      pending(this.#number(), 'seed', settings.size)
    );
    this.#set({
      items: [...kept, ...items],
      nextSeed: first + this.#size > this.maxSeed ? 0 : first + this.#size,
      seeds:
        shown === null
          ? { first, last: first + this.#size - 1 }
          : shown !== undefined && shown.last + 1 === first
            ? { first: shown.first, last: first + this.#size - 1 }
            : undefined,
    });
    this.#start(
      items.map((_, k) => ({ settings, seed: first + k })),
      items
    );
    return items;
  }

  /**
   * The maze of a recipe read by `readRecipe`. A recipe of this generator rebuilds from its own
   * settings alone; one without a version is of version 1. A recipe of an older generator opens
   * the walls it saved; one without them is rebuilt with `settings` filling the switches it lacks,
   * and marked `older`, as the maze differs.
   */
  rebuild(recipe: SavedRecipe, settings: Settings): Item {
    this.cancel();
    const version: number | undefined = recipe.version;
    const older = version === GENERATOR_VERSION ? undefined : (version ?? 1);
    const n = this.#number();

    if (older !== undefined && recipe.walls !== undefined) {
      const item: Item = {
        n,
        origin: 'loaded',
        status: 'ready',
        size: recipe.settings.size,
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

    const own = older === undefined ? recipe.settings : olderSettings(recipe.settings, settings);
    const item: Item = { ...pending(n, 'loaded', own.size), older, hash: recipe.hash };
    this.#set({ items: [...this.#state.items, item] });
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

  /** The next number to call a maze by, never one the batch gave before. */
  #number(): number {
    this.#numbered += 1;
    return this.#numbered;
  }

  #set(changes: Partial<BatchState>): void {
    this.#state = { ...this.#state, ...changes };

    for (const listener of this.#listeners) {
      listener();
    }
  }

  /** Runs `jobs` in the workers, each filling the item at its index as soon as it is built. */
  #start(jobs: readonly Job[], items: readonly Item[]): void {
    const queue = jobs.map((job, k) => ({ job, item: items[k] }));
    const holding = new Map<Runner, Item | undefined>();
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

      for (const runner of runners) {
        runner.terminate();
      }

      const slots = new Set(items.map(({ n }) => n));
      this.#run = undefined;
      this.#set({
        items: this.#state.items.map((item) =>
          slots.has(item.n) && item.status === 'pending' ? filledItem(item, undefined) : item
        ),
        progress: null,
      });
    };

    const post = (runner: Runner): void => {
      const next = queue.shift();
      holding.set(runner, next?.item);

      if (next !== undefined) {
        runner.post(next.job);
      }
    };

    for (let k = 0; k < Math.min(this.#workers, jobs.length); k++) {
      const runner: Runner = this.#spawn(
        (result) => {
          if (this.#run !== run) {
            return;
          }

          const slot = holding.get(runner);
          const progress = this.#state.progress;
          const builtAt = this.#now();

          if (slot !== undefined) {
            this.#tracks.set(slot.n, {
              ...this.track(slot.n),
              started: true,
              walls: result.grid.walls,
            });
          }

          this.#set({
            progress: progress === null ? null : { ...progress, done: progress.done + 1 },
            items:
              slot === undefined
                ? this.#state.items
                : this.#state.items.map((item) =>
                    item.n === slot.n ? { ...filledItem(slot, result), builtAt } : item
                  ),
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
        },
        (snapshot) => {
          const slot = holding.get(runner);

          if (this.#run === run && slot !== undefined) {
            this.#tracks.set(
              slot.n,
              followTrack(this.track(slot.n), snapshot, slot.size, this.#now())
            );
          }
        }
      );
      runners.push(runner);
      post(runner);
    }
  }
}

function pending(n: number, origin: Item['origin'], size: Item['size']): Item {
  return { n, origin, status: 'pending', size };
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
    misses: result.misses,
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
