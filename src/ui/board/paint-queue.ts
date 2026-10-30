/**
 * Painting thumbnails a few at a time, in the browser's idle time, and for the library's grid in
 * each frame too, so a zoom that crosses a band or a scroll that mounts a row never paints many in
 * one frame. Until then a thumbnail keeps its previous bitmap, scaled, or shows what is under it
 * (DESIGN.md 12).
 *
 * @module
 */

/** A stretch of time the queue may paint in. */
export interface IdlePeriod {
  /** How many milliseconds are left. */
  timeRemaining(): number;
  /** Whether this turn must paint something even when little time is left. */
  readonly mustProgress: boolean;
}

/** Calls `run` in the next idle period. */
export type IdleScheduler = (run: (period: IdlePeriod) => void) => void;

/** A queue of paints. */
export interface PaintQueue {
  /**
   * Runs `paint` in a coming idle period, before the paints not `first` when it is; the function
   * returned takes it back if not yet run.
   */
  schedule(paint: () => void, first?: boolean): () => void;
}

/**
 * Below this much idle time left, the rest waits for the next period: a thumbnail takes 3 to 6 ms
 * to paint on a phone-class CPU, measured at four times throttling.
 */
export const MIN_IDLE_MS = 8;

/**
 * How long a frame may go on painting once it painted one: a fling's frame paints two or three
 * previews of 2.5 ms, or one sharp thumbnail, measured at four times throttling.
 */
export const FRAME_PAINT_MS = 5;

/** A queue that paints in the periods `whenIdle` gives it, at least one paint when it must. */
export function createPaintQueue(whenIdle: IdleScheduler): PaintQueue {
  const firstJobs = new Set<() => void>();
  const jobs = new Set<() => void>();
  let scheduled = false;

  const schedule = (): void => {
    if (!scheduled && firstJobs.size + jobs.size > 0) {
      scheduled = true;
      whenIdle(run);
    }
  };

  function run(period: IdlePeriod): void {
    scheduled = false;
    let painted = 0;

    for (const job of [...firstJobs, ...jobs]) {
      if (period.timeRemaining() < MIN_IDLE_MS && !(period.mustProgress && painted === 0)) {
        break;
      }

      if (!firstJobs.delete(job) && !jobs.delete(job)) {
        continue;
      }

      job();
      painted++;
    }

    schedule();
  }

  return {
    schedule: (paint, first = false) => {
      const queue = first ? firstJobs : jobs;
      queue.add(paint);
      schedule();
      return () => {
        queue.delete(paint);
      };
    },
  };
}

/**
 * The browser's idle periods; with `eachFrame`, raced against the next animation frame, which
 * paints for {@link FRAME_PAINT_MS} and at least one thumbnail, since a fling leaves almost no idle
 * time on a phone. Without `requestIdleCallback`, as in Safari, only the frames paint.
 */
export function browserIdleScheduler(eachFrame: boolean): IdleScheduler {
  return (run) => {
    const nextFrame = (): void => {
      const end = performance.now() + FRAME_PAINT_MS;
      run({ timeRemaining: () => MIN_IDLE_MS + end - performance.now(), mustProgress: true });
    };

    if (typeof window.requestIdleCallback !== 'function') {
      requestAnimationFrame(nextFrame);
      return;
    }

    const idle = window.requestIdleCallback((deadline) => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }

      run({ timeRemaining: () => deadline.timeRemaining(), mustProgress: false });
    });
    const frame = eachFrame
      ? requestAnimationFrame(() => {
          window.cancelIdleCallback(idle);
          nextFrame();
        })
      : undefined;
  };
}

let idleQueue: PaintQueue | undefined;
let frameQueue: PaintQueue | undefined;

/**
 * Runs `paint` in a coming idle period of one of the app's two queues, the one that with
 * `eachFrame` also paints each frame; the function returned takes it back. Without
 * `requestIdleCallback` both are one queue, its `eachFrame` paints first, so a frame paints
 * within {@link FRAME_PAINT_MS} once, not twice.
 */
export function schedulePaint(paint: () => void, eachFrame = false): () => void {
  const queue =
    eachFrame && typeof window.requestIdleCallback === 'function'
      ? (frameQueue ??= createPaintQueue(browserIdleScheduler(true)))
      : (idleQueue ??= createPaintQueue(browserIdleScheduler(false)));
  return queue.schedule(paint, eachFrame);
}
