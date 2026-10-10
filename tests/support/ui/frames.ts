/**
 * Measuring motion as DESIGN.md 8 asks: the intervals between consecutive
 * `requestAnimationFrame` timestamps while something moves, p95 at or below 20 ms and at most 1 %
 * of the intervals above 25 ms, the median of three runs (see {@link medianRun}).
 *
 * @module
 */

/** The budget of DESIGN.md 8 for a path that is not a flight. */
export const FRAME_BUDGET = { p95: 20, slowFrame: 25, slowShare: 0.01 } as const;

/** What a run of frames measured. */
export interface FrameReport {
  readonly frames: number;
  /** The 95th percentile interval, in milliseconds. */
  readonly p95: number;
  /** The share of intervals above 25 ms. */
  readonly slowShare: number;
  /** The longest interval, in milliseconds. */
  readonly worst: number;
}

/** The report of a list of frame intervals. */
export function frameReport(intervals: readonly number[]): FrameReport {
  const sorted = intervals.toSorted((left, right) => left - right);
  const at = (share: number): number =>
    sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] ?? 0;
  return {
    frames: sorted.length,
    p95: at(0.95),
    slowShare:
      sorted.filter((interval) => interval > FRAME_BUDGET.slowFrame).length / sorted.length,
    worst: sorted.at(-1) ?? 0,
  };
}

/**
 * Runs `step` once per animation frame, `count` times, and measures the intervals between the
 * frames from the first step to one frame after the last.
 */
export async function measureFrames(
  count: number,
  step: (index: number) => void
): Promise<FrameReport> {
  const stamps: number[] = [];

  await new Promise<void>((resolve) => {
    const frame = (now: number): void => {
      stamps.push(now);

      if (stamps.length > count) {
        resolve();
        return;
      }

      step(stamps.length - 1);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  return frameReport(stamps.slice(1).map((stamp, index) => stamp - (stamps[index] ?? stamp)));
}

/** Measures `runs` runs of {@link measureFrames}, one after the other, and gives the median. */
export async function medianOfRuns(
  runs: number,
  count: number,
  step: (index: number) => void
): Promise<FrameReport> {
  const reports: FrameReport[] = [];

  for (let run = 0; run < runs; run++) {
    reports.push(await measureFrames(count, step));
  }

  return medianRun(reports);
}

/**
 * The median run, the runs ordered by their share of slow frames, then by their worst frame, then
 * by their p95, so the run taken is the middle one on what the budget is strictest about, and one
 * stray frame of a loaded machine in one run does not decide.
 */
export function medianRun(reports: readonly FrameReport[]): FrameReport {
  const sorted = reports.toSorted(
    (left, right) =>
      left.slowShare - right.slowShare || left.worst - right.worst || left.p95 - right.p95
  );
  const median = sorted[Math.floor(sorted.length / 2)];

  if (median === undefined) {
    throw new Error('no run to take the median of');
  }

  return median;
}
