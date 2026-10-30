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
   * Runs `paint` in a coming idle period; the function returned takes it back if not yet run. A
   * `preview` runs before the other paints, and is the only kind a period that must progress adds
   * after its first paint.
   */
  schedule(paint: () => void, preview?: boolean): () => void;
}

/**
 * Below this much idle time left, the rest waits for the next period: a thumbnail takes 3 to 6 ms
 * to paint on a phone-class CPU, measured at four times throttling.
 */
export const MIN_IDLE_MS = 8;

/**
 * How long after its first paint a frame may still start a preview: a fling's frame paints two or
 * three previews of 2.5 ms, or one sharp thumbnail of 6 ms, measured at four times throttling.
 */
export const FRAME_PAINT_MS = 5;

/**
 * A queue that paints in the periods `whenIdle` gives it, at least one paint when it must, and
 * then only previews.
 */
export function createPaintQueue(whenIdle: IdleScheduler): PaintQueue {
  const previews = new Set<() => void>();
  const jobs = new Set<() => void>();
  let scheduled = false;

  const schedule = (): void => {
    if (!scheduled && previews.size + jobs.size > 0) {
      scheduled = true;
      whenIdle(run);
    }
  };

  function run(period: IdlePeriod): void {
    scheduled = false;
    let painted = 0;

    for (const job of [...previews, ...jobs]) {
      const preview = previews.has(job);

      if (!preview && !jobs.has(job)) {
        continue;
      }

      const hasRoom = period.timeRemaining() >= MIN_IDLE_MS && (!period.mustProgress || preview);

      if (!hasRoom && !(period.mustProgress && painted === 0)) {
        break;
      }

      previews.delete(job);
      jobs.delete(job);
      job();
      painted++;
    }

    schedule();
  }

  return {
    schedule: (paint, preview = false) => {
      const queue = preview ? previews : jobs;
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
 * paints at least one thumbnail and starts previews for {@link FRAME_PAINT_MS} more, since a fling
 * leaves almost no idle time on a phone. Without `requestIdleCallback`, as in Safari, only the
 * frames paint.
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
 * `eachFrame` also paints each frame; the function returned takes it back. A `preview`, cheap,
 * paints before the rest, and a frame that painted already starts only previews, within
 * {@link FRAME_PAINT_MS}. Without `requestIdleCallback` both are one queue, so a frame starts one
 * paint that is not a preview at most.
 */
export function schedulePaint(paint: () => void, eachFrame = false, preview = false): () => void {
  const queue =
    eachFrame && typeof window.requestIdleCallback === 'function'
      ? (frameQueue ??= createPaintQueue(browserIdleScheduler(true)))
      : (idleQueue ??= createPaintQueue(browserIdleScheduler(false)));
  return queue.schedule(paint, preview);
}
