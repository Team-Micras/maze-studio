import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { cpuBenchmark, throttleRate } from '@tests/support/cpu-rate';
import { FRAME_BUDGET, frameReport, medianRun, type FrameReport } from '@tests/support/ui/frames';

const app = inject('appUrl');
const STEPS = 200;
const RUNS = 3;

let browser: Browser;
let slowdown = 1;

type Motion = 'drag' | 'zoom';

/**
 * Runs one motion in the page, one input per animation frame, and returns the intervals between
 * the frames; the page's own code, as built for production, does the work.
 */
function runMotion(page: Page, motion: Motion): Promise<number[]> {
  return page.evaluate(
    ([kind, steps]) =>
      new Promise<number[]>((resolve) => {
        const stage = document.querySelector<HTMLElement>('[role="application"]');
        const stamps: number[] = [];
        const pointer = (type: string, y: number, buttons: number): void => {
          stage?.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
              pointerType: 'mouse',
              button: 1,
              buttons,
              clientX: 720,
              clientY: y,
            })
          );
        };
        const step = (index: number): void => {
          if (kind === 'zoom') {
            stage?.dispatchEvent(
              new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                ctrlKey: true,
                deltaY: index < steps / 2 ? -1.5 : 1.5,
                clientX: 700,
                clientY: 500,
              })
            );
            return;
          }

          if (index === 0) {
            pointer('pointerdown', 800, 4);
          }

          pointer('pointermove', 800 - (index + 1) * 18, 4);

          if (index === steps - 1) {
            pointer('pointerup', 800 - steps * 18, 0);
          }
        };
        const frame = (now: number): void => {
          stamps.push(now);

          if (stamps.length > steps) {
            resolve(stamps.slice(1).map((stamp, index) => stamp - (stamps[index] ?? stamp)));
            return;
          }

          step(stamps.length - 1);
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    [motion, STEPS] as const
  );
}

async function measure(motion: Motion): Promise<FrameReport> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(app);
  await page.locator('a[data-artboard]').first().waitFor();
  await page.waitForTimeout(500);
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
  const reports: FrameReport[] = [];

  try {
    for (let run = 0; run < RUNS; run++) {
      reports.push(frameReport(await runMotion(page, motion)));
    }
  } finally {
    await context.close();
  }

  return medianRun(reports);
}

function describeRun(name: string, report: FrameReport): string {
  return `production ${name}: p95 ${report.p95.toFixed(1)} ms, ${(report.slowShare * 100).toFixed(1)} % over 25 ms, worst ${report.worst.toFixed(1)} ms`;
}

beforeAll(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext();

  try {
    const measured = await cpuBenchmark(await context.newPage());
    slowdown = throttleRate(measured);
    console.info(`CPU benchmark ${measured.toFixed(1)} ms, throttled ${slowdown.toFixed(2)}×`);
  } finally {
    await context.close();
  }
});

afterAll(async () => {
  await browser?.close();
});

describe('The built library as slow as the reference notebook at 4× CPU throttling', () => {
  test.each<Motion>(['drag', 'zoom'])(
    '%s keeps the frame budget of DESIGN.md 8',
    async (motion) => {
      const report = await measure(motion);
      console.info(describeRun(motion, report));

      expect(report.frames).toBe(STEPS);
      expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET.p95);
      expect(report.slowShare).toBeLessThanOrEqual(FRAME_BUDGET.slowShare);
    }
  );
});
