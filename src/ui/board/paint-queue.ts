/**
 * Painting thumbnails a few at a time, only in the browser's idle time, so a zoom that crosses a
 * band or a scroll that mounts a row never paints in a busy frame. Until then a thumbnail keeps its
 * previous bitmap, scaled, or shows its floor colour (DESIGN.md 12).
 *
 * @module
 */

/** What the queue needs of an idle period. */
interface IdlePeriod {
  timeRemaining(): number;
}

/**
 * Below this much idle time left, the rest waits for the next idle period: a thumbnail takes 3 to
 * 6 ms to paint on a phone-class CPU, measured at four times throttling.
 */
const MIN_IDLE_MS = 8;

/** The time a browser without idle callbacks gives the queue at each turn. */
const FALLBACK_BUDGET_MS = MIN_IDLE_MS;

const jobs = new Set<() => void>();
let scheduled = false;

function whenIdle(run: (period: IdlePeriod) => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run);
    return;
  }

  window.setTimeout(() => {
    const started = performance.now();
    run({ timeRemaining: () => Math.max(0, FALLBACK_BUDGET_MS - (performance.now() - started)) });
  }, 0);
}

function runJobs(period: IdlePeriod): void {
  scheduled = false;

  for (const job of jobs) {
    if (period.timeRemaining() < MIN_IDLE_MS) {
      break;
    }

    jobs.delete(job);
    job();
  }

  schedule();
}

function schedule(): void {
  if (!scheduled && jobs.size > 0) {
    scheduled = true;
    whenIdle(runJobs);
  }
}

/** Runs `paint` in a coming idle period; the function returned takes it back if not yet run. */
export function schedulePaint(paint: () => void): () => void {
  jobs.add(paint);
  schedule();
  return () => {
    jobs.delete(paint);
  };
}
