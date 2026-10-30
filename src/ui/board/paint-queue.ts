/**
 * Painting thumbnails a few at a time, in the browser's idle time, and for the library's grid one
 * a frame too, so a zoom that crosses a band or a scroll that mounts a row never paints many in
 * one frame. Until then a thumbnail keeps its previous bitmap, scaled, or shows its floor colour
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
  /** Runs `paint` in a coming idle period; the function returned takes it back if not yet run. */
  schedule(paint: () => void): () => void;
}

/**
 * Below this much idle time left, the rest waits for the next period: a thumbnail takes 3 to 6 ms
 * to paint on a phone-class CPU, measured at four times throttling.
 */
export const MIN_IDLE_MS = 8;

/** A queue that paints in the periods `whenIdle` gives it, at least one paint when it must. */
export function createPaintQueue(whenIdle: IdleScheduler): PaintQueue {
  const jobs = new Set<() => void>();
  let scheduled = false;

  const schedule = (): void => {
    if (!scheduled && jobs.size > 0) {
      scheduled = true;
      whenIdle(run);
    }
  };

  function run(period: IdlePeriod): void {
    scheduled = false;
    let painted = 0;

    for (const job of jobs) {
      if (period.timeRemaining() < MIN_IDLE_MS && !(period.mustProgress && painted === 0)) {
        break;
      }

      jobs.delete(job);
      job();
      painted++;
    }

    schedule();
  }

  return {
    schedule: (paint) => {
      jobs.add(paint);
      schedule();
      return () => {
        jobs.delete(paint);
      };
    },
  };
}

/**
 * The browser's idle periods; with `eachFrame`, raced against the next animation frame, which
 * paints exactly one thumbnail, since a fling leaves almost no idle time on a phone. Without
 * `requestIdleCallback`, as in Safari, only the frames paint.
 */
export function browserIdleScheduler(eachFrame: boolean): IdleScheduler {
  return (run) => {
    const nextFrame = (): void => run({ timeRemaining: () => 0, mustProgress: true });

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

const shared = new Map<boolean, PaintQueue>();

/**
 * Runs `paint` in a coming idle period of one of the app's two queues, the one that with
 * `eachFrame` also paints one a frame; the function returned takes it back. Without
 * `requestIdleCallback` both are one queue, so a frame paints one thumbnail, not two.
 */
export function schedulePaint(paint: () => void, eachFrame = false): () => void {
  const kind = eachFrame && typeof window.requestIdleCallback === 'function';
  let queue = shared.get(kind);

  if (queue === undefined) {
    queue = createPaintQueue(browserIdleScheduler(kind));
    shared.set(kind, queue);
  }

  return queue.schedule(paint);
}
