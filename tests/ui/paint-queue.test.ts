import { describe, expect, test } from 'vitest';

import {
  createPaintQueue,
  MIN_IDLE_MS,
  type IdlePeriod,
  type IdleScheduler,
} from '@/ui/board/paint-queue';

/** A scheduler the test drives: each `turn` runs the queue once with the period given. */
function manualScheduler(): { whenIdle: IdleScheduler; turn: (period: IdlePeriod) => boolean } {
  let pending: ((period: IdlePeriod) => void) | undefined;
  return {
    whenIdle: (run) => {
      pending = run;
    },
    turn: (given) => {
      const run = pending;
      pending = undefined;
      run?.(given);
      return run !== undefined;
    },
  };
}

/** A period that loses `cost` ms of its time for every paint done in it. */
function shrinkingPeriod(
  start: number,
  mustProgress: boolean,
  painted: { count: number },
  cost = 5
) {
  return {
    timeRemaining: () => start - painted.count * cost,
    mustProgress,
  };
}

describe('The paint queue', () => {
  test('paints only while an idle period has room for a paint', () => {
    const scheduler = manualScheduler();
    const queue = createPaintQueue(scheduler.whenIdle);
    const painted = { count: 0 };
    for (let index = 0; index < 5; index++) {
      queue.schedule(() => painted.count++);
    }

    scheduler.turn(shrinkingPeriod(MIN_IDLE_MS + 6, false, painted));
    expect(painted.count).toBe(2);

    scheduler.turn(shrinkingPeriod(MIN_IDLE_MS - 1, false, painted));
    expect(painted.count).toBe(2);
  });

  test('paints at least one per turn when the period must progress, as without idle callbacks', () => {
    const scheduler = manualScheduler();
    const queue = createPaintQueue(scheduler.whenIdle);
    const painted = { count: 0 };
    for (let index = 0; index < 3; index++) {
      queue.schedule(() => painted.count++);
    }

    for (let turn = 1; turn <= 3; turn++) {
      scheduler.turn({ timeRemaining: () => 0, mustProgress: true });
      expect(painted.count).toBe(turn);
    }

    expect(scheduler.turn({ timeRemaining: () => 0, mustProgress: true })).toBe(false);
  });

  test('forgets a paint taken back before it runs', () => {
    const scheduler = manualScheduler();
    const queue = createPaintQueue(scheduler.whenIdle);
    const painted: string[] = [];
    queue.schedule(() => painted.push('kept'));
    const takeBack = queue.schedule(() => painted.push('taken back'));
    takeBack();
    scheduler.turn({ timeRemaining: () => 50, mustProgress: false });

    expect(painted).toEqual(['kept']);
  });
});
