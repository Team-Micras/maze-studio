import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  browserIdleScheduler,
  createPaintQueue,
  FRAME_PAINT_MS,
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
      queue.schedule(() => {
        painted.count++;
      });
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
      queue.schedule(() => {
        painted.count++;
      });
    }

    for (let turn = 1; turn <= 3; turn++) {
      scheduler.turn({ timeRemaining: () => 0, mustProgress: true });
      expect(painted.count).toBe(turn);
    }

    expect(scheduler.turn({ timeRemaining: () => 0, mustProgress: true })).toBe(false);
  });

  test('runs the previews before the other paints', () => {
    const scheduler = manualScheduler();
    const queue = createPaintQueue(scheduler.whenIdle);
    const painted: string[] = [];
    queue.schedule(() => {
      painted.push('sharp');
    });
    queue.schedule(() => {
      painted.push('preview');
    }, true);
    const takeBack = queue.schedule(() => {
      painted.push('taken back');
    }, true);
    takeBack();
    scheduler.turn({ timeRemaining: () => 0, mustProgress: true });

    expect(painted).toEqual(['preview']);
  });

  test('adds only previews after the first paint of a period that must progress', () => {
    const scheduler = manualScheduler();
    const queue = createPaintQueue(scheduler.whenIdle);
    const painted: string[] = [];
    queue.schedule(() => {
      painted.push('sharp a');
    });
    queue.schedule(() => {
      painted.push('sharp b');
    });
    queue.schedule(() => {
      painted.push('preview a');
    }, true);
    queue.schedule(() => {
      painted.push('preview b');
    }, true);
    const frame = { timeRemaining: () => 50, mustProgress: true };

    scheduler.turn(frame);
    expect(painted).toEqual(['preview a', 'preview b']);

    scheduler.turn(frame);
    expect(painted).toEqual(['preview a', 'preview b', 'sharp a']);

    scheduler.turn({ timeRemaining: () => 50, mustProgress: false });
    expect(painted).toEqual(['preview a', 'preview b', 'sharp a', 'sharp b']);
  });

  test('lets a paint that painted nothing take no room in a frame', () => {
    const scheduler = manualScheduler();
    const queue = createPaintQueue(scheduler.whenIdle);
    const painted: string[] = [];
    queue.schedule(() => false);
    queue.schedule(() => {
      painted.push('sharp');
    });
    scheduler.turn({ timeRemaining: () => 0, mustProgress: true });

    expect(painted).toEqual(['sharp']);
  });

  test('forgets a paint taken back before it runs', () => {
    const scheduler = manualScheduler();
    const queue = createPaintQueue(scheduler.whenIdle);
    const painted: string[] = [];
    queue.schedule(() => {
      painted.push('kept');
    });
    const takeBack = queue.schedule(() => {
      painted.push('taken back');
    });
    takeBack();
    scheduler.turn({ timeRemaining: () => 50, mustProgress: false });

    expect(painted).toEqual(['kept']);
  });
});

/** Callbacks of one kind the browser holds until the test fires them. */
class Pending<Callback> {
  readonly #callbacks = new Map<number, Callback>();
  #next = 1;

  add = (callback: Callback): number => {
    this.#callbacks.set(this.#next, callback);
    return this.#next++;
  };

  cancel = (id: number): void => {
    this.#callbacks.delete(id);
  };

  get size(): number {
    return this.#callbacks.size;
  }

  /** Runs and forgets every callback held. */
  fire(call: (callback: Callback) => void): void {
    const callbacks = [...this.#callbacks.values()];
    this.#callbacks.clear();
    callbacks.forEach(call);
  }
}

/** A browser whose animation frames and idle callbacks run only when the test fires them. */
function fakeBrowser() {
  const frames = new Pending<FrameRequestCallback>();
  const idles = new Pending<IdleRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', frames.add);
  vi.stubGlobal('cancelAnimationFrame', frames.cancel);
  vi.stubGlobal('window', { requestIdleCallback: idles.add, cancelIdleCallback: idles.cancel });
  return { frames, idles };
}

describe("The browser's idle scheduler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('runs nothing at once, and the frame takes back the idle callback', () => {
    const { frames, idles } = fakeBrowser();
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    const periods: IdlePeriod[] = [];
    browserIdleScheduler(true)((period) => periods.push(period));

    expect(periods).toEqual([]);
    expect([frames.size, idles.size]).toEqual([1, 1]);

    frames.fire((callback) => callback(0));
    expect(idles.size).toBe(0);
    expect(periods.map((period) => period.mustProgress)).toEqual([true]);
    expect(periods[0]?.timeRemaining()).toBe(MIN_IDLE_MS + FRAME_PAINT_MS);

    now.mockReturnValue(100 + FRAME_PAINT_MS);
    expect(periods[0]?.timeRemaining()).toBe(MIN_IDLE_MS);
    now.mockRestore();
  });

  test('takes back the frame when the idle callback comes first', () => {
    const { frames, idles } = fakeBrowser();
    const periods: IdlePeriod[] = [];
    browserIdleScheduler(true)((period) => periods.push(period));

    idles.fire((callback) => callback({ didTimeout: false, timeRemaining: () => 12 }));
    expect(frames.size).toBe(0);
    expect(periods.map((period) => [period.timeRemaining(), period.mustProgress])).toEqual([
      [12, false],
    ]);
  });

  test('asks for no frame unless told to paint each frame', () => {
    const { frames, idles } = fakeBrowser();
    browserIdleScheduler(false)(() => undefined);

    expect([frames.size, idles.size]).toEqual([0, 1]);
  });
});
