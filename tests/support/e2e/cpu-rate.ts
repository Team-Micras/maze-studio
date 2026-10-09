/**
 * The CPU throttle of the production frame gate, calibrated to the machine. DESIGN.md 8 measures
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
 * Times a fixed JavaScript workload in the page, unthrottled, after one warm-up, and returns the
 * median of seven runs in milliseconds.
 */
export function cpuBenchmark(page: Page): Promise<number> {
  return page.evaluate(
    ([iterations, runs]) => {
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
    },
    [ITERATIONS, RUNS] as const
  );
}
