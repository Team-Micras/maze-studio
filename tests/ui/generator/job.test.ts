import { describe, expect, test } from 'vitest';

import { PRESETS } from '@/generator';
import {
  progressTrace,
  runJob,
  SNAPSHOT_EVERY,
  TRIED_KEPT,
  type JobProgress,
} from '@/ui/generator/job';

const SETTINGS =
  PRESETS[0]?.settings ??
  (() => {
    throw new Error('no preset');
  })();

const walls = () => new Uint8Array(4);

describe('progressTrace', () => {
  test('sends a snapshot at each change of stage and at most every 25 ms within one', () => {
    let clock = 0;
    const sent: JobProgress[] = [];
    const trace = progressTrace(
      (progress) => sent.push(progress),
      () => clock
    );

    trace('board', walls());
    trace('board', walls());
    clock = SNAPSHOT_EVERY - 1;
    trace('board', walls());
    expect(sent).toHaveLength(1);
    trace('routes', walls());
    expect(sent).toHaveLength(2);
    clock += SNAPSHOT_EVERY;
    trace('routes', walls());
    expect(sent).toHaveLength(3);
  });

  test('lets the routes tried ride along with the next snapshot, the newest eight', () => {
    let clock = 0;
    const sent: JobProgress[] = [];
    const trace = progressTrace(
      (progress) => sent.push(progress),
      () => clock
    );

    trace('board', walls());

    for (let k = 0; k < 20; k++) {
      trace('candidate', walls(), { route: [0, k], kind: 'racing' });
    }

    expect(sent).toHaveLength(1);
    clock = SNAPSHOT_EVERY;
    trace('candidate', walls(), { route: [0, 20], kind: 'careful' });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.tried).toHaveLength(TRIED_KEPT);
    expect(sent[1]?.tried.at(-1)).toEqual({ route: [0, 20], kind: 'careful' });
    trace('routes', walls());
    expect(sent[2]?.tried).toEqual([]);
  });

  test('copies the walls, which the generator goes on changing', () => {
    const sent: JobProgress[] = [];
    const board = walls();
    progressTrace((progress) => sent.push(progress))('board', board);
    board[0] = 15;

    expect(sent[0]?.walls[0]).toBe(0);
  });
});

describe('runJob', () => {
  test('builds the same maze when it streams its progress, the last snapshot a maze', () => {
    const sent: JobProgress[] = [];
    const streamed = runJob({ settings: SETTINGS, seed: 3 }, (progress) => sent.push(progress));
    const plain = runJob({ settings: SETTINGS, seed: 3 });

    expect(streamed.grid.walls).toEqual(plain.grid.walls);
    expect(streamed.recipe.hash).toBe(plain.recipe.hash);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.some(({ tried }) => tried.length > 0)).toBe(true);
  });
});
