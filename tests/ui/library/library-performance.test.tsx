import { expect, test } from 'vitest';

import '@/ui/styles.css';
import { cpuBenchmarkHere, throttleRate } from '@tests/support/cpu-rate';
import { FRAME_BUDGET, medianOfRuns, type FrameReport } from '@tests/support/ui/frames';
import { artboards, mountApp } from '@tests/support/ui/library-app';
import { throttled } from '@tests/support/ui/throttle';

const STEPS = 200;
const RUNS = 3;

/**
 * The share of frames over 25 ms this gate allows: twice DESIGN.md 8's 1 %. The development build,
 * in the tester's iframe, spreads from 0 to 1.5 % between runs on the reference notebook; the
 * production gate of the e2e project holds the 1 % (decisions.md).
 */
const DEV_SLOW_SHARE = 0.02;

/** The throttle that makes this machine as slow as the reference notebook at 4×. */
function slowdown(): number {
  const measured = cpuBenchmarkHere();
  const rate = throttleRate(measured);
  console.info(`CPU benchmark ${measured.toFixed(1)} ms, throttled ${rate.toFixed(2)}×`);
  return rate;
}

function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-library-scroller]');
}

function describeRun(name: string, report: FrameReport, mounted: number): string {
  return `${name}: p95 ${report.p95.toFixed(1)} ms, ${(report.slowShare * 100).toFixed(1)} % over 25 ms, worst ${report.worst.toFixed(1)} ms, at most ${mounted} artboards mounted`;
}

function expectWithinBudget(report: FrameReport): void {
  expect(report.frames).toBe(STEPS);
  expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET.p95);
  expect(report.slowShare).toBeLessThanOrEqual(DEV_SLOW_SHARE);
}

test('scrolling every maze of the repository keeps 2 % of frames over 25 ms at most, at 4× CPU throttling', async () => {
  await mountApp();
  let mounted = 0;

  const median = await throttled(slowdown(), () =>
    medianOfRuns(RUNS, STEPS, () => {
      mounted = Math.max(mounted, artboards().length);
      scroller()?.scrollTo({ top: (scroller()?.scrollTop ?? 0) + 40, behavior: 'instant' });
    })
  );
  console.info(describeRun('library scroll', median, mounted));

  expect(scroller()?.scrollTop).toBe(RUNS * STEPS * 40);
  expectWithinBudget(median);
});
