import { describe, expect, test } from 'vitest';

import {
  GENERATOR_VERSION,
  PRESETS,
  generate,
  readRecipe,
  withMaze,
  type SavedRecipe,
} from '@/generator';
import { Batch, MAX_SEED, randomSeed, workerCount, type Spawn } from '@/ui/generator/batch-run';
import { isReady, itemWarning, profileOf, requestOf, statusLine } from '@/ui/generator/candidates';
import { runJob, type Job } from '@/ui/generator/job';

const SETTINGS =
  PRESETS[0]?.settings ??
  (() => {
    throw new Error('no preset');
  })();

/**
 * Workers that run each job in a later task, as a real worker answers, and count the live ones;
 * `fail` says which of them, by the order they were started, fail instead.
 */
function workers(options: { fail?: (index: number) => boolean } = {}) {
  const live = new Set<object>();
  let started = 0;
  const spawn: Spawn = (onResult, onError) => {
    const index = started++;
    const runner = {
      post: (job: Job) => {
        setTimeout(() => {
          if (live.has(runner)) {
            if (options.fail?.(index) === true) {
              onError();
            } else {
              onResult(runJob(job));
            }
          }
        }, 0);
      },
      terminate: () => live.delete(runner),
    };
    live.add(runner);
    return runner;
  };
  return { spawn, live };
}

/** The seed drawn when the random source gives `value`, at most the largest first seed of 8. */
function drawn(value: number): number {
  return randomSeed(MAX_SEED - 7, (values) => {
    values[0] = value;
  });
}

function settled(batch: Batch): Promise<void> {
  return new Promise((resolve) => {
    const stop = batch.subscribe(() => {
      if (batch.getState().progress === null) {
        stop();
        resolve();
      }
    });
  });
}

describe('a batch of generated mazes', () => {
  test('builds one seed per card, in a row, shows each maze as it arrives and stops its workers', async () => {
    const { spawn, live } = workers();
    const batch = new Batch({ spawn, workers: 2, size: 2, firstSeed: 1 });
    const done: number[] = [];
    const shownEarly: number[] = [];
    batch.subscribe(() => {
      const { progress, items } = batch.getState();
      done.push(progress?.done ?? -1);

      if (progress !== null) {
        shownEarly.push(items.filter((item) => item.status === 'ready').length);
      }
    });
    const items = batch.generate(SETTINGS, true);

    expect(items.map((item) => item.status)).toEqual(['pending', 'pending']);
    expect(statusLine(batch.getState())).toBe('Building 0 of 2…');
    await settled(batch);

    const state = batch.getState();
    expect(done.filter((n) => n > 0)).toEqual([1, 2]);
    expect(shownEarly).toContain(1);
    expect(live.size).toBe(0);
    expect(state.items.every(isReady)).toBe(true);
    expect(state.items.map((item) => item.n)).toEqual([1, 2]);
    expect(state.items.map((item) => item.seed)).toEqual([1, 2]);
    expect(statusLine(state)).toBe('Seeds 1–2');

    const [first] = state.items;

    if (!isReady(first)) {
      throw new Error('not ready');
    }

    expect(first.recipe).toMatchObject({ version: GENERATOR_VERSION, seed: first.seed });
    expect(first.recipe.walls).toHaveLength(256);
    expect(requestOf(first)).toMatchObject({
      kind: 'generated',
      name: `Generated ${first.seed}`,
      profile: 'classic',
      recipe: first.recipe,
    });
    expect(
      profileOf({
        ...first,
        recipe: { ...first.recipe, settings: { ...SETTINGS, competition: false } },
      })
    ).toBe('free');
  }, 60_000);

  test('drops the mazes still pending when cancelled, and keeps the earlier ones with More', async () => {
    const { spawn, live } = workers();
    const batch = new Batch({ spawn, workers: 1, size: 1, firstSeed: 1 });
    batch.generate(SETTINGS, true);
    await settled(batch);
    batch.generate(SETTINGS, false);

    expect(batch.getState().items.map((item) => item.status)).toEqual(['ready', 'pending']);
    batch.cancel();
    expect(batch.getState().items.map((item) => item.status)).toEqual(['ready']);
    expect(batch.getState().progress).toBeNull();
    expect(live.size).toBe(0);
    expect(batch.getState().nextSeed).toBe(3);
  }, 60_000);

  test('says so when a worker fails, and leaves the mazes it did not make failed', async () => {
    const { spawn } = workers({ fail: () => true });
    const batch = new Batch({ spawn, workers: 2, size: 2, firstSeed: 1 });
    batch.generate(SETTINGS, true);
    await settled(batch);

    expect(batch.getState().stopped).toBe(true);
    expect(batch.getState().items.map((item) => item.status)).toEqual(['failed', 'failed']);
  });

  test('shows what the other workers made when one fails', async () => {
    const { spawn, live } = workers({ fail: (index) => index === 0 });
    const batch = new Batch({ spawn, workers: 2, size: 2, firstSeed: 1 });
    batch.generate(SETTINGS, true);
    await settled(batch);

    expect(batch.getState().stopped).toBe(true);
    expect(batch.getState().items.map((item) => item.status)).toEqual(['failed', 'ready']);
    expect(live.size).toBe(0);
  }, 60_000);

  test('keeps every seed of a batch within what a recipe allows', () => {
    const batch = new Batch({ spawn: workers().spawn, size: 8 });
    batch.setNextSeed(0xffffffff);

    expect(batch.getState().nextSeed).toBe(0xffffffff - 7);
    batch.setNextSeed(-5);
    expect(batch.getState().nextSeed).toBe(0);
  });

  test('rebuilds a recipe, and warns when the walls are not the ones it saved', async () => {
    const candidate = generate(SETTINGS, 1);
    const recipe: SavedRecipe = withMaze(candidate.recipe, candidate.grid);
    const { spawn } = workers();
    const batch = new Batch({ spawn, workers: 1 });

    const same = batch.rebuild(recipe, SETTINGS);
    await settled(batch);
    const rebuilt = batch.getState().items.find((item) => item.n === same.n);
    expect(rebuilt).toMatchObject({ status: 'ready', origin: 'loaded', mismatch: false });
    expect(isReady(rebuilt) ? itemWarning(rebuilt) : 'not ready').toBeUndefined();

    const other = batch.rebuild({ ...recipe, hash: '00000000' }, SETTINGS);
    await settled(batch);
    const moved = batch.getState().items.find((item) => item.n === other.n);
    expect(moved).toMatchObject({ mismatch: true });
    expect(isReady(moved) ? itemWarning(moved) : '').toBe(
      `This generator rebuilt other walls than the recipe saved (wall hash ${candidate.recipe.hash ?? ''}, saved 00000000): the seed no longer verifies`
    );
  }, 60_000);

  test('takes a recipe without a version for one of version 1, rebuilt as an older one', async () => {
    const batch = new Batch({ spawn: workers().spawn, workers: 1 });
    const item = batch.rebuild(
      readRecipe(JSON.stringify({ settings: SETTINGS, seed: 1 })),
      SETTINGS
    );
    await settled(batch);

    expect(item).toMatchObject({ older: 1 });
    const built = batch.getState().items.find((each) => each.n === item.n);
    expect(isReady(built) ? itemWarning(built) : '').toBe(
      'Made by an older generator (version 1): this one builds a different maze from the same seed'
    );
  }, 60_000);

  test('opens the walls an older generator saved, as they were', () => {
    const candidate = generate(SETTINGS, 1);
    const recipe = {
      ...withMaze(candidate.recipe, candidate.grid),
      version: GENERATOR_VERSION - 1,
    };
    const batch = new Batch({ spawn: workers().spawn });
    const item = batch.rebuild(recipe, SETTINGS);

    expect(item).toMatchObject({ status: 'ready', older: GENERATOR_VERSION - 1, saved: true });
    expect(Array.from(item.grid?.walls ?? [])).toEqual(Array.from(candidate.grid.walls));
    expect(isReady(item) ? itemWarning(item) : '').toBe(
      `Made by an older generator (version ${GENERATOR_VERSION - 1}): shown as it was saved`
    );
  });

  test('runs one worker fewer than the cores, from one to four', () => {
    expect([undefined, 1, 2, 4, 16].map(workerCount)).toEqual([1, 1, 1, 3, 4]);
  });

  test('sends a maze without its flood distances', () => {
    const result = runJob({ settings: SETTINGS, seed: 1 });

    expect(Object.hasOwn(result.analysis, 'dist')).toBe(false);
    expect(result.recipe.hash).toBe(generate(SETTINGS, 1).recipe.hash);
  });

  test('draws a random seed over the whole range a recipe allows, never past the largest first seed', () => {
    expect(drawn(0)).toBe(0);
    expect(drawn(123_456_789)).toBe(123_456_789);
    expect(drawn(MAX_SEED)).toBe(MAX_SEED - 7);
    expect(new Batch({ spawn: workers().spawn }).getState().nextSeed).toBeLessThanOrEqual(
      MAX_SEED - 7
    );
    expect(
      Array.from({ length: 50 }, () => randomSeed(1000)).every((seed) => seed >= 0 && seed <= 1000)
    ).toBe(true);
  });

  test('never gives two mazes one number, after a run cancelled with gaps', async () => {
    const { spawn } = workers();
    const batch = new Batch({ spawn, workers: 1, size: 2, firstSeed: 1 });
    batch.generate(SETTINGS, true);
    await settled(batch);
    batch.generate(SETTINGS, false);
    batch.cancel();
    batch.generate(SETTINGS, false);
    const numbers = batch.getState().items.map((item) => item.n);

    expect(new Set(numbers).size).toBe(numbers.length);
    batch.rebuild(withMaze(generate(SETTINGS, 1).recipe, generate(SETTINGS, 1).grid), SETTINGS);
    const after = batch.getState().items.map((item) => item.n);
    expect(new Set(after).size).toBe(after.length);
    batch.cancel();
  }, 60_000);

  test('starts again from seed 0 once a batch reaches the top of the range', () => {
    const batch = new Batch({ spawn: workers({ fail: () => true }).spawn, size: 8 });
    batch.setNextSeed(MAX_SEED);
    batch.generate(SETTINGS, true);

    expect(batch.getState().seeds).toEqual({ first: MAX_SEED - 7, last: MAX_SEED });
    expect(batch.getState().nextSeed).toBe(0);
    batch.cancel();
  });
});
