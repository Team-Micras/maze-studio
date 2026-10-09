/**
 * The CPU throttle of the frame gates, calibrated to the machine. DESIGN.md 8 measures
 * the library four times slower than the notebook it was designed on; a slower machine, such as a
 * CI runner with two vCPUs, is throttled less, so that the gate never asks for more than that.
 *
 * @module
 */

import type { Page } from 'playwright';

/** The slowdown DESIGN.md 8 measures at, on the reference notebook. */
export const TARGET_SLOWDOWN = 4;

/**
 * The median time of {@link cpuBenchmark}'s workload on the reference notebook, an i5-12500H,
 * in Chromium of Playwright 1.63 unthrottled, in milliseconds; decisions.md records how.
 */
export const REFERENCE_BENCHMARK_MS = 27;

const ITERATIONS = 20_000_000;
const RUNS = 7;

/**
 * The CPU throttling rate that makes this machine as slow as the reference notebook at
 * {@link TARGET_SLOWDOWN}: `clamp(target × reference / measured, 1, target)`.
 */
export function throttleRate(
  measuredMs: number,
  referenceMs: number = REFERENCE_BENCHMARK_MS,
  target: number = TARGET_SLOWDOWN
): number {
  return Math.min(target, Math.max(1, (target * referenceMs) / measuredMs));
}

/**
 * Times a fixed JavaScript workload, unthrottled, after one warm-up, and returns the median of
 * `runs` runs in milliseconds. Self-contained, so that it runs in a page through
 * `page.evaluate` as well as where it is called.
 */
export function cpuWorkload([iterations, runs]: readonly [number, number]): number {
  const work = (): number => {
    let state = 1;
    let sum = 0;

    for (let index = 0; index < iterations; index++) {
      state = (Math.imul(state, 1_103_515_245) + 12_345) | 0;
      sum += Math.sqrt((state >>> 8) & 0xffff);
    }

    return sum;
  };
  const times: number[] = [];
  let sink = work();

  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    sink += work();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  return Number.isFinite(sink) ? (times[Math.floor(runs / 2)] ?? 0) : 0;
}

/** {@link cpuWorkload} with the reference's numbers, run where it is called. */
export function cpuBenchmarkHere(): number {
  return cpuWorkload([ITERATIONS, RUNS]);
}

/** {@link cpuWorkload} with the reference's numbers, run in `page`. */
export function cpuBenchmark(page: Page): Promise<number> {
  return page.evaluate(cpuWorkload, [ITERATIONS, RUNS] as const);
}
