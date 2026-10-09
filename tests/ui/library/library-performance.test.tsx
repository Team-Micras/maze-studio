import { expect, test } from 'vitest';

import '@/ui/styles.css';
import { FRAME_BUDGET, medianOfRuns, type FrameReport } from '@tests/support/ui/frames';
import { artboards, mountApp } from '@tests/support/ui/library-app';
import { shownCamera } from '@tests/support/ui/shown-camera';
import { throttled } from '@tests/support/ui/throttle';

const STEPS = 200;
const RUNS = 3;
const SLOWDOWN = 4;

function stage(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="application"]');

  if (element === null) {
    throw new Error('no library canvas');
  }

  return element;
}

function pointer(type: string, clientY: number, buttons: number): void {
  stage().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 1,
      buttons,
      clientX: 720,
      clientY,
    })
  );
}

function describeRun(name: string, report: FrameReport, mounted: number): string {
  return `${name}: p95 ${report.p95.toFixed(1)} ms, ${(report.slowShare * 100).toFixed(1)} % over 25 ms, worst ${report.worst.toFixed(1)} ms, at most ${mounted} artboards mounted`;
}

function expectWithinBudget(report: FrameReport): void {
  expect(report.frames).toBe(STEPS);
  expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET.p95);
  expect(report.slowShare).toBeLessThanOrEqual(FRAME_BUDGET.slowShare);
}

test('dragging the 581 mazes keeps the frame budget of DESIGN.md 8 at 4× CPU throttling', async () => {
  await mountApp();
  const start = shownCamera();
  let mounted = 0;
  let travelled = 0;

  const median = await throttled(SLOWDOWN, () =>
    medianOfRuns(RUNS, STEPS, (index) => {
      if (index === 0) {
        pointer('pointerdown', 800, 4);
      }

      mounted = Math.max(mounted, artboards().length);
      travelled = Math.max(travelled, Math.abs(shownCamera().y - start.y));
      pointer('pointermove', 800 - (index + 1) * 18, 4);

      if (index === STEPS - 1) {
        pointer('pointerup', 800 - STEPS * 18, 0);
      }
    })
  );
  console.info(describeRun('library drag', median, mounted));

  expect(travelled).toBeGreaterThan(2000);
  expectWithinBudget(median);
});

test('zooming the 581 mazes keeps the frame budget of DESIGN.md 8 at 4× CPU throttling', async () => {
  await mountApp();
  const fit = shownCamera().k;
  let mounted = 0;
  let deepest = 1;

  const median = await throttled(SLOWDOWN, () =>
    medianOfRuns(RUNS, STEPS, (index) => {
      mounted = Math.max(mounted, artboards().length);
      deepest = Math.max(deepest, shownCamera().k / fit);
      stage().dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: index < STEPS / 2 ? -1.5 : 1.5,
          clientX: 700,
          clientY: 500,
        })
      );
    })
  );
  console.info(describeRun('library zoom', median, mounted));

  expect(deepest).toBeGreaterThan(3);
  expectWithinBudget(median);
});
