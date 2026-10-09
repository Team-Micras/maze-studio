/**
 * Painting thumbnails a few at a time, in the browser's idle time, so a zoom that crosses a band
 * or a scroll that mounts a row never paints in a busy frame. Until then a thumbnail keeps its
 * previous bitmap, scaled, or shows its floor colour (DESIGN.md 12).
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

/** The frame a browser without idle callbacks leaves between two turns. */
export const FALLBACK_FRAME_MS = 16;

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
 * The browser's idle periods: `requestIdleCallback` where there is one; elsewhere, as in Safari, a
 * turn every 16 ms that knows nothing of idle time and so paints exactly one thumbnail.
 */
export function browserIdleScheduler(): IdleScheduler {
  if (typeof window.requestIdleCallback === 'function') {
    return (run) =>
      window.requestIdleCallback((deadline) =>
        run({ timeRemaining: () => deadline.timeRemaining(), mustProgress: false })
      );
  }

  return (run) => {
    window.setTimeout(() => run({ timeRemaining: () => 0, mustProgress: true }), FALLBACK_FRAME_MS);
  };
}

let shared: PaintQueue | undefined;

/** Runs `paint` in a coming idle period of the app's one queue; the function returned takes it back. */
export function schedulePaint(paint: () => void): () => void {
  shared ??= createPaintQueue(browserIdleScheduler());
  return shared.schedule(paint);
}
