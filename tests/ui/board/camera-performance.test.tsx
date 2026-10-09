import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import '@/ui/styles.css';
import { settled } from '@tests/support/ui/animations';
import { BoardHarness } from '@tests/support/ui/board-harness';
import { FRAME_BUDGET, medianOfRuns, type FrameReport } from '@tests/support/ui/frames';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';
import { shownCamera } from '@tests/support/ui/shown-camera';

const STEPS = 200;
const RUNS = 3;

function stage(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="application"]');

  if (element === null) {
    throw new Error('no stage');
  }

  return element;
}

async function mountHalfsize(): Promise<void> {
  const maze = await repoMaze(REPO_MAZES.halfsize);
  await render(<BoardHarness maze={maze} />);
  await expect
    .poll(() => document.querySelector<HTMLElement>('[data-world]')?.style.transform)
    .toBeTruthy();
  await settled();
}

function zoomStep(index: number): void {
  const inward = index < STEPS / 2;
  stage().dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: inward ? -2 : 2,
      clientX: 520 + (index % 20),
      clientY: 380,
    })
  );
}

function dragStep(index: number): void {
  const angle = (index / STEPS) * 2 * Math.PI;
  stage().dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 4,
      clientX: 720 + 300 * Math.cos(angle) - 300,
      clientY: 450 + 300 * Math.sin(angle),
    })
  );
}

function expectWithinBudget(report: FrameReport): void {
  expect(report.frames).toBe(STEPS);
  expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET.p95);
  expect(report.slowShare).toBeLessThanOrEqual(FRAME_BUDGET.slowShare);
}

function describeRun(name: string, report: FrameReport): string {
  return `${name}: p95 ${report.p95.toFixed(1)} ms, ${(report.slowShare * 100).toFixed(1)} % over 25 ms, worst ${report.worst.toFixed(1)} ms`;
}

test('zooming a 32×32 board with the wheel keeps the frame budget of DESIGN.md 8', async () => {
  await mountHalfsize();
  const fit = shownCamera().k;
  const zooms: number[] = [];
  const median = await medianOfRuns(RUNS, STEPS, (index) => {
    zooms.push(shownCamera().k / fit);
    zoomStep(index);
  });
  console.info(describeRun('zoom', median));

  expect(Math.max(...zooms)).toBeGreaterThan(5);
  expectWithinBudget(median);
});

test('dragging a zoomed 32×32 board keeps the frame budget of DESIGN.md 8', async () => {
  await mountHalfsize();

  for (let press = 0; press < 6; press++) {
    stage().dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
  }

  await settled();
  stage().dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      button: 1,
      buttons: 4,
      clientX: 720,
      clientY: 450,
    })
  );
  const start = shownCamera();
  const shifts: number[] = [];
  const median = await medianOfRuns(RUNS, STEPS, (index) => {
    const now = shownCamera();
    shifts.push(Math.hypot(now.x - start.x, now.y - start.y));
    dragStep(index);
  });
  console.info(describeRun('drag', median));

  expect(Math.max(...shifts)).toBeGreaterThan(400);
  expectWithinBudget(median);
});
