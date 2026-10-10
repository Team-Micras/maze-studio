import { expect, test } from 'vitest';

import { boardGeometry } from '@/render';
import '@/ui/styles.css';
import { settled } from '@tests/support/ui/animations';
import { FRAME_BUDGET, measureFrames, medianRun, type FrameReport } from '@tests/support/ui/frames';
import { artboards, mountApp } from '@tests/support/ui/library-app';

const RUNS = 3;
const FLIGHT_FRAMES = 40;
const LIST_STEPS = 50;
const STROKE_STEPS = 200;
const FLIGHT_WORST_MS = 33;

/** The frame of the click after the press, about 50 ms later, as a person's click comes. */
const CLICK_FRAME = 3;

function mode(): string | null | undefined {
  return document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode');
}

async function until(expected: string): Promise<void> {
  await expect.poll(mode, { timeout: 3000 }).toBe(expected);
  await settled();
}

function describeRun(name: string, report: FrameReport): string {
  return `${name}: p95 ${report.p95.toFixed(1)} ms, ${(report.slowShare * 100).toFixed(1)} % over 25 ms, worst ${report.worst.toFixed(1)} ms`;
}

function expectWithinBudget(report: FrameReport, worst = Number.POSITIVE_INFINITY): void {
  expect(report.p95).toBeLessThanOrEqual(FRAME_BUDGET.p95);
  expect(report.slowShare).toBeLessThanOrEqual(FRAME_BUDGET.slowShare);
  expect(report.worst).toBeLessThanOrEqual(worst);
}

test('the flights into a maze and back keep the frame budget of DESIGN.md 8', async () => {
  await mountApp();
  const inward: FrameReport[] = [];
  const outward: FrameReport[] = [];

  for (let run = 0; run < RUNS; run++) {
    const flyingIn = new Set<string>();
    inward.push(
      await measureFrames(FLIGHT_FRAMES, (index) => {
        if (index === 0) {
          artboards()[6]?.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 })
          );
        } else if (index === CLICK_FRAME) {
          artboards()[6]?.click();
        }

        flyingIn.add(mode() ?? '');
      })
    );
    await until('editor');
    expect(flyingIn.has('flying-in')).toBe(true);

    const flyingOut = new Set<string>();
    outward.push(
      await measureFrames(FLIGHT_FRAMES, (index) => {
        if (index === 0) {
          window.history.back();
        }

        flyingOut.add(mode() ?? '');
      })
    );
    await until('library');
    expect(flyingOut.has('flying-out')).toBe(true);
  }

  const into = medianRun(inward);
  const back = medianRun(outward);
  console.info(describeRun('flight in', into));
  console.info(describeRun('flight back', back));
  expectWithinBudget(into, FLIGHT_WORST_MS);
  expectWithinBudget(back, FLIGHT_WORST_MS);
});

test('fifty ↓ in a row through the open quick list keep the frame budget of DESIGN.md 8', async () => {
  await mountApp();
  artboards()[6]?.click();
  await until('editor');
  const reports: FrameReport[] = [];

  for (let run = 0; run < RUNS; run++) {
    document.querySelector<HTMLButtonElement>('button[aria-label="Maze list"]')?.click();
    await expect.poll(() => document.querySelector('[cmdk-input]')).not.toBeNull();
    await settled();
    const input = document.querySelector<HTMLInputElement>('[cmdk-input]');
    const titles = new Set<string>();
    reports.push(
      await measureFrames(LIST_STEPS, () => {
        titles.add(document.querySelector('h1')?.textContent ?? '');
        input?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
        );
      })
    );
    expect(titles.size).toBeGreaterThan(LIST_STEPS / 2);
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect.poll(() => document.querySelector('[cmdk-input]')).toBeNull();
  }

  const median = medianRun(reports);
  console.info(describeRun(`quick list, ${LIST_STEPS} ↓`, median));
  expectWithinBudget(median);
});

test('a stroke over a 32×32 board, one move a frame, keeps the frame budget of DESIGN.md 8', async () => {
  await mountApp('#/repo/halfsize/japan2011hef.txt');
  await until('editor');
  const stage = document.querySelector<HTMLElement>('[role="application"]');
  const svg = document.querySelector('[data-open-board] svg[data-board]');
  const box = svg?.getBoundingClientRect();
  const geometry = boardGeometry({ width: 32, height: 32 });
  const scale = (box?.width ?? 0) / geometry.width;
  const at = (u: number, v: number): { clientX: number; clientY: number } => ({
    clientX: (box?.x ?? 0) + (geometry.margin + u * geometry.pitch) * scale,
    clientY: (box?.y ?? 0) + (geometry.margin + (geometry.rows - v) * geometry.pitch) * scale,
  });
  const press = (type: string, u: number, v: number): void => {
    stage?.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        ...at(u, v),
      })
    );
  };
  const reports: FrameReport[] = [];

  for (let run = 0; run < RUNS; run++) {
    const row = 4 + run * 8;
    press('pointerdown', 2.2, row);
    reports.push(
      await measureFrames(STROKE_STEPS, (index) => {
        const lane = Math.floor(index / 50);
        const along = (index % 50) * 0.5;
        press('pointermove', lane % 2 === 0 ? 2 + along : 27 - along, row + lane);
      })
    );
    press('pointerup', 2, row);
    await settled();
  }

  const median = medianRun(reports);
  console.info(describeRun(`stroke, ${STROKE_STEPS} moves`, median));
  await expect.poll(() => window.location.hash).toMatch(/^#\/mine\//);
  expect(document.querySelector('h1')?.textContent).toBe('japan2011hef (edited)');
  expectWithinBudget(median);
});
