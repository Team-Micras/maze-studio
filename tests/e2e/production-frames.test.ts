import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { cpuBenchmark, throttleRate } from '@tests/support/cpu-rate';
import { FRAME_BUDGET, frameReport, medianRun, type FrameReport } from '@tests/support/ui/frames';

const app = inject('appUrl');

/** DESIGN.md 8: no interval of a flight above 33 ms. */
const FLIGHT_WORST_MS = 33;

/** How long a person holds a click, from the press to the release. */
const CLICK_HOLD_MS = 50;

declare global {
  interface Window {
    frameSamples?: FrameSample[];
    frameRecording?: boolean;
  }
}

/** One animation frame: its time, the world's transform and the studio's mode. */
interface FrameSample {
  readonly at: number;
  readonly transform: string;
  readonly mode: string;
}

/** The frames a flight lasts after its landing that still count, for what the landing mounts. */
const LANDING_FRAMES = 3;

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

/** Starts recording every animation frame of the page. */
async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const samples: FrameSample[] = [];
    window.frameSamples = samples;
    window.frameRecording = true;
    const frame = (at: number): void => {
      samples.push({
        at,
        transform: document.querySelector<HTMLElement>('[data-world]')?.style.transform ?? '',
        mode: document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') ?? '',
      });

      if (window.frameRecording === true) {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
  });
}

/**
 * Stops recording and returns the intervals of the flight: from the frame before the camera first
 * moved to a few frames after the studio reached `landed`.
 */
async function stopFlight(page: Page, landed: string): Promise<number[]> {
  const samples = await page.evaluate(() => {
    window.frameRecording = false;
    return window.frameSamples ?? [];
  });
  const moved = samples.findIndex(
    (sample, index) => index > 0 && sample.transform !== samples[index - 1]?.transform
  );
  const landing = samples.findIndex((sample) => sample.mode === landed);
  const flight = samples.slice(Math.max(0, moved - 1), landing + LANDING_FRAMES + 1);
  return flight.slice(1).map((sample, index) => sample.at - (flight[index]?.at ?? sample.at));
}

async function waitForMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(
    (wanted) =>
      document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === wanted,
    mode
  );
}

/**
 * The flights into a maze and back, `RUNS` times each on the built app at the calibrated throttle,
 * after a press on the artboard held as a person holds a click, or Back.
 */
async function measureFlights(): Promise<{ inward: FrameReport; outward: FrameReport }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(app);
  const artboard = page.locator('a[data-artboard]').nth(6);
  await artboard.waitFor();
  await page.waitForTimeout(500);
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
  const inward: FrameReport[] = [];
  const outward: FrameReport[] = [];

  try {
    for (let run = 0; run < RUNS; run++) {
      const box = await artboard.boundingBox();
      await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + 40);
      await startRecording(page);
      await page.mouse.down();
      await page.waitForTimeout(CLICK_HOLD_MS);
      await page.mouse.up();
      await waitForMode(page, 'editor');
      await page.waitForTimeout(150);
      inward.push(frameReport(await stopFlight(page, 'editor')));

      await startRecording(page);
      await page.goBack();
      await waitForMode(page, 'library');
      await page.waitForTimeout(150);
      outward.push(frameReport(await stopFlight(page, 'library')));
      await page.waitForTimeout(300);
    }
  } finally {
    await context.close();
  }

  return { inward: medianRun(inward), outward: medianRun(outward) };
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

describe('The built studio as slow as the reference notebook at 4× CPU throttling', () => {
  test('flies into a maze and back within the frame budget of DESIGN.md 8', async () => {
    const { inward, outward } = await measureFlights();
    console.info(describeRun('flight in', inward));
    console.info(describeRun('flight back', outward));

    for (const report of [inward, outward]) {
      expect(report.frames).toBeGreaterThan(20);
      expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET.p95);
      expect(report.slowShare).toBeLessThanOrEqual(FRAME_BUDGET.slowShare);
      expect(report.worst).toBeLessThanOrEqual(FLIGHT_WORST_MS);
    }
  });
});
