import { appendFileSync } from 'node:fs';

import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { cpuBenchmark, throttleRate } from '@tests/support/cpu-rate';
import { FRAME_BUDGET, frameReport, medianRun, type FrameReport } from '@tests/support/ui/frames';

const app = inject('appUrl');

/** DESIGN.md 8: no interval of a flight longer than two refreshes at 60 Hz, 34.3 ms. */
const FLIGHT_WORST_MS = 2 * (1000 / 60) + 1;

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

/**
 * Scrolls the library on down 60 px at every animation frame, 3600 px a second as a fling goes,
 * from where the last run stopped, and returns the intervals between the frames; the page's own
 * code, as built for production, does the work.
 */
function runScroll(page: Page): Promise<number[]> {
  return page.evaluate(
    (steps) =>
      new Promise<number[]>((resolve) => {
        const stamps: number[] = [];
        const scroller = document.querySelector<HTMLElement>('[data-library-scroller]');
        const start = scroller?.scrollTop ?? 0;
        const frame = (now: number): void => {
          stamps.push(now);

          if (stamps.length > steps) {
            resolve(stamps.slice(1).map((stamp, index) => stamp - (stamps[index] ?? stamp)));
            return;
          }

          scroller?.scrollTo({ top: start + stamps.length * 60, behavior: 'instant' });
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    STEPS
  );
}

async function measureScroll(): Promise<FrameReport> {
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
      reports.push(frameReport(await runScroll(page)));
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
 * The report of the runs of one flight: p95 and the share of slow frames over the intervals of all
 * the runs, about 135, whose 1 % the gate rounds up to whole frames; the worst interval of the
 * median run, as for every gate.
 */
function flightReport(runs: readonly (readonly number[])[]): FrameReport {
  return { ...frameReport(runs.flat()), worst: medianRun(runs.map(frameReport)).worst };
}

/**
 * The flights into a maze and back, `RUNS` times each on the built app at the calibrated throttle,
 * after a press on the artboard held as a person holds a click, or Back, as {@link flightReport}
 * reports them.
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
  const inward: number[][] = [];
  const outward: number[][] = [];

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
      inward.push(await stopFlight(page, 'editor'));

      await startRecording(page);
      await page.goBack();
      await waitForMode(page, 'library');
      await page.waitForTimeout(150);
      outward.push(await stopFlight(page, 'library'));
      await page.waitForTimeout(300);
    }
  } finally {
    await context.close();
  }

  return { inward: flightReport(inward), outward: flightReport(outward) };
}

function describeRun(name: string, run: FrameReport): string {
  return `production ${name}: p95 ${run.p95.toFixed(1)} ms, ${(run.slowShare * 100).toFixed(1)} % over 25 ms, worst ${run.worst.toFixed(1)} ms`;
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

/** Prints `line`, and on GitHub Actions adds it to the job's summary, where a passing run shows it. */
function report(line: string): void {
  console.info(line);
  const summary = process.env.GITHUB_STEP_SUMMARY;

  if (summary !== undefined) {
    appendFileSync(summary, `${line}\n\n`);
  }
}

/** What of the frame budget `run` breaks, as sentences; none when it holds. */
function breaches(name: string, run: FrameReport, worst = Infinity): string[] {
  const slow = Math.round(run.slowShare * run.frames);
  const allowed = Math.ceil(FRAME_BUDGET.slowShare * run.frames);
  return [
    run.p95 > FRAME_BUDGET.p95 ? `${name}: p95 ${run.p95.toFixed(1)} ms` : '',
    slow > allowed ? `${name}: ${slow} frames over 25 ms, ${allowed} allowed` : '',
    run.worst > worst ? `${name}: a frame of ${run.worst.toFixed(1)} ms` : '',
  ].filter((breach) => breach !== '');
}

/**
 * Holds the gate where it runs on a known machine, and only reports it on CI, whose shared runners
 * are too uneven for a frame budget (decisions.md).
 */
function gate(found: readonly string[]): void {
  const onCi = process.env.CI !== undefined;

  if (onCi && found.length > 0) {
    report(`frame budget not held on CI, reported only: ${found.join('; ')}`);
  }

  expect(onCi ? [] : found).toEqual([]);
}

describe('The built library as slow as the reference notebook at 4× CPU throttling', () => {
  test('scrolls through every maze within the frame budget of DESIGN.md 8', async () => {
    const scroll = await measureScroll();
    report(describeRun('scroll', scroll));

    expect(scroll.frames).toBe(STEPS);
    gate(breaches('scroll', scroll));
  });
});

describe('The built studio as slow as the reference notebook at 4× CPU throttling', () => {
  test('flies into a maze and back within the frame budget of DESIGN.md 8', async () => {
    const { inward, outward } = await measureFlights();
    report(describeRun('flight in', inward));
    report(describeRun('flight back', outward));

    expect(inward.frames).toBeGreaterThan(20 * RUNS);
    expect(outward.frames).toBeGreaterThan(20 * RUNS);
    gate([
      ...breaches('flight in', inward, FLIGHT_WORST_MS),
      ...breaches('flight back', outward, FLIGHT_WORST_MS),
    ]);
  });
});
