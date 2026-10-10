import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import { cubicBezier } from '@/render';
import { FLIGHT_IN_MS } from '@/ui/studio/studio-store';
import {
  openPage,
  parseCamera,
  studioMode as mode,
  worldCamera as camera,
  type Camera,
  type PageOptions,
} from '@tests/support/e2e/studio-page';

const app = inject('appUrl');

declare global {
  interface Window {
    studioFrames?: Frame[];
    studioRecording?: boolean;
    modeAfterClick?: string | null;
    worldSamples?: WorldSample[];
  }
}

let browser: Browser;
const contexts: BrowserContext[] = [];

interface Frame {
  readonly mode: string;
  readonly board?: { x: number; y: number; width: number; height: number };
  /** The scale the labels and rings follow, `--k` on the world. */
  readonly labelScale: string;
}

interface WorldSample {
  readonly at: number;
  readonly transform: string;
}

function open(hash = '#/', options: PageOptions = {}): Promise<Page> {
  return openPage(browser, contexts, app, hash, options);
}

/** Records every new transform of the world layer, with the time of the frame that set it. */
async function recordWorld(page: Page): Promise<() => Promise<WorldSample[]>> {
  await page.evaluate(() => {
    const world = document.querySelector<HTMLElement>('[data-world]');
    const samples: WorldSample[] = [];
    window.worldSamples = samples;

    if (world !== null) {
      new MutationObserver(() => {
        if (samples.at(-1)?.transform !== world.style.transform) {
          samples.push({
            at: Number(document.timeline.currentTime ?? performance.now()),
            transform: world.style.transform,
          });
        }
      }).observe(world, { attributes: true, attributeFilter: ['style'] });
    }
  });
  return () => page.evaluate(() => window.worldSamples ?? []);
}

/** The flight's curve as DESIGN.md 8 writes it, apart from the constant the app uses. */
const DESIGN_FLIGHT_CURVE = cubicBezier(0.45, 0, 0.12, 1);

/**
 * The largest gap between the eased progress seen and the flight's curve over `duration`, at the start
 * time that fits best; the progress comes from the zoom, which grows geometrically with it.
 */
function easingError(samples: readonly WorldSample[], from: Camera, to: Camera, duration: number) {
  const progress = samples
    .map((sample) => ({
      at: sample.at,
      eased: Math.log(parseCamera(sample.transform).k / from.k) / Math.log(to.k / from.k),
    }))
    .filter((sample) => sample.eased > 0.05 && sample.eased < 0.95);
  const first = progress[0]?.at ?? 0;
  let best = Number.POSITIVE_INFINITY;

  for (let start = first - duration; start <= first; start += 0.5) {
    const worst = Math.max(
      ...progress.map((sample) =>
        Math.abs(DESIGN_FLIGHT_CURVE(Math.min(1, (sample.at - start) / duration)) - sample.eased)
      )
    );
    best = Math.min(best, worst);
  }

  return { samples: progress.length, error: best };
}

/** Records the mode, the open board's box and `--k` at every frame until `stop` is called. */
async function recordFrames(page: Page): Promise<() => Promise<Frame[]>> {
  await page.evaluate(() => {
    const frames: Frame[] = [];
    window.studioFrames = frames;
    window.studioRecording = true;
    const sample = (): void => {
      const box = document.querySelector('[data-open-board]')?.getBoundingClientRect();
      frames.push({
        mode: document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') ?? '',
        labelScale:
          document.querySelector<HTMLElement>('[data-world]')?.style.getPropertyValue('--k') ?? '',
        ...(box === undefined
          ? {}
          : { board: { x: box.x, y: box.y, width: box.width, height: box.height } }),
      });

      if (window.studioRecording === true) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  return () =>
    page.evaluate(() => {
      window.studioRecording = false;
      return window.studioFrames ?? [];
    });
}

function distanceToLine(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number }
): number {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return length === 0
    ? Math.hypot(point.x - from.x, point.y - from.y)
    : Math.abs(
        (to.y - from.y) * point.x - (to.x - from.x) * point.y + to.x * from.y - to.y * from.x
      ) / length;
}

function center(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openFirstMaze(page: Page): Promise<string> {
  const link = page.locator('a[data-artboard]').nth(6);
  const key = (await link.getAttribute('data-artboard')) ?? '';
  await link.click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'editor'
  );
  return key;
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

describe('The flight into a maze and back', () => {
  test('passes through flying, keeps the board on a straight line and lands still', async () => {
    const page = await open();
    const stop = await recordFrames(page);
    await page.locator('a[data-artboard]').nth(6).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'editor'
    );
    const landed = await page.locator('[data-open-board]').boundingBox();
    await page.waitForTimeout(350);
    const later = await page.locator('[data-open-board]').boundingBox();
    const frames = await stop();
    const flying = frames.filter(
      (frame) => frame.mode === 'flying-in' && frame.board !== undefined
    );
    const start = center(flying[0]?.board ?? { x: 0, y: 0, width: 0, height: 0 });
    const end = center(landed ?? { x: 0, y: 0, width: 0, height: 0 });
    const worst = Math.max(
      ...flying.map((frame) =>
        distanceToLine(center(frame.board ?? { x: 0, y: 0, width: 0, height: 0 }), start, end)
      )
    );
    console.info(
      `flight in: ${flying.length} frames, farthest ${worst.toFixed(2)} px from the line`
    );

    expect(flying.length).toBeGreaterThan(10);
    expect(new Set(flying.map((frame) => frame.labelScale)).size).toBe(1);
    expect(landed).not.toBeNull();
    expect(worst).toBeLessThan(2);
    expect(Math.abs((later?.x ?? 0) - (landed?.x ?? 0))).toBeLessThan(0.5);
    expect(Math.abs((later?.y ?? 0) - (landed?.y ?? 0))).toBeLessThan(0.5);
    expect(Math.abs((later?.width ?? 0) - (landed?.width ?? 0))).toBeLessThan(0.5);
    expect(new URL(page.url()).hash).toMatch(/^#\/repo\//);
  });

  test('follows cubic-bezier(0.45, 0, 0.12, 1) over 620 ms', async () => {
    const page = await open();
    const from = await camera(page);
    const stop = await recordWorld(page);
    await openFirstMaze(page);
    const to = await camera(page);
    const { samples, error } = easingError(await stop(), from, to, FLIGHT_IN_MS);
    console.info(`flight easing: ${samples} samples, at most ${error.toFixed(3)} off the curve`);

    expect(samples).toBeGreaterThan(10);
    expect(error).toBeLessThan(0.02);
  });

  test('a press on an artboard mounts its board, hidden, before the click opens it', async () => {
    const page = await open();
    const artboard = page.locator('a[data-artboard]').nth(6);
    const box = await artboard.boundingBox();
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + 40);

    expect(await page.locator('[data-open-board]').count()).toBe(0);
    await page.mouse.down();
    await expect.poll(() => page.locator('[data-open-board][data-hidden]').count()).toBe(1);
    expect(await mode(page)).toBe('library');
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'editor'
    );

    expect(await page.locator('[data-open-board]').count()).toBe(1);
  });

  test('the browser Back flies back, shrinking the board to its artboard, and lands focused', async () => {
    const page = await open();
    const key = await openFirstMaze(page);
    const stop = await recordFrames(page);
    await page.goBack();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'library'
    );
    const frames = await stop();
    const landed = await page.locator(`a[data-artboard="${key}"]`).boundingBox();
    const widths = frames
      .filter((frame) => frame.mode === 'flying-out' && frame.board !== undefined)
      .map((frame) => frame.board?.width ?? 0);

    expect(
      new Set(
        frames.filter((frame) => frame.mode === 'flying-out').map((frame) => frame.labelScale)
      ).size
    ).toBe(1);
    expect(new Set(widths.map((width) => Math.round(width))).size).toBeGreaterThan(10);
    expect(widths[0] ?? 0).toBeGreaterThan(2 * (widths.at(-1) ?? 0));
    expect(
      widths.every((width, index) => index === 0 || width <= (widths[index - 1] ?? 0) + 0.5)
    ).toBe(true);
    expect(Math.abs((widths.at(-1) ?? 0) - (landed?.width ?? 0))).toBeLessThan(
      0.1 * (landed?.width ?? 1)
    );
    expect(new URL(page.url()).hash).toBe('#/');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-artboard'))).toBe(
      key
    );
  });

  test('with reduced motion, the editor is there in the frame after the click', async () => {
    const page = await open('#/', { reduced: true });
    await page.evaluate(() => {
      window.addEventListener(
        'click',
        () =>
          requestAnimationFrame(() => {
            window.modeAfterClick = document
              .querySelector('[data-studio-mode]')
              ?.getAttribute('data-studio-mode');
          }),
        { capture: true, once: true }
      );
    });
    await page.locator('a[data-artboard]').nth(6).click();
    await page.waitForFunction(() => window.modeAfterClick !== undefined);
    const next = await page.evaluate(() => window.modeAfterClick);

    expect(next).toBe('editor');
  });
});

describe('The library', () => {
  test('a drag that starts on an artboard pans and does not open it', async () => {
    const page = await open();
    const box = await page.locator('a[data-artboard]').nth(6).boundingBox();
    const start = center(box ?? { x: 0, y: 0, width: 0, height: 0 });
    const before = await camera(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y - 8, { steps: 2 });
    await page.mouse.move(start.x, start.y - 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await camera(page);

    expect(after.y - before.y).toBeCloseTo(-60, 0);
    expect(new URL(page.url()).hash).toBe('#/');
    expect(await mode(page)).toBe('library');
  });
});

describe('The minimap of an open maze', () => {
  test('hides at the fit, shows past 1.06 times it, centres a corner and follows a drag', async () => {
    const page = await open();
    await openFirstMaze(page);
    const minimap = page.locator('[data-minimap]');

    expect(await minimap.getAttribute('data-minimap')).toBe('hidden');
    await page.locator('#canvas').focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.waitForFunction(
      () => document.querySelector('[data-minimap]')?.getAttribute('data-minimap') === 'shown'
    );
    await page.waitForTimeout(250);

    const board = await page.locator('[data-minimap-board]').boundingBox();
    const world = await page.locator('[data-open-board]').boundingBox();
    const target = {
      x: (board?.x ?? 0) + (board?.width ?? 0) * 0.9,
      y: (board?.y ?? 0) + (board?.height ?? 0) * 0.1,
    };
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(100);
    const after = await page.locator('[data-open-board]').boundingBox();
    const share = { x: 0.9, y: 0.1 };
    const pointOnScreen = {
      x: (after?.x ?? 0) + (after?.width ?? 0) * share.x,
      y: (after?.y ?? 0) + (after?.height ?? 0) * share.y,
    };
    const cell = (after?.width ?? 0) / 16;

    expect(world).toBeDefined();
    expect(Math.abs(pointOnScreen.x - 720)).toBeLessThan(cell);
    expect(Math.abs(pointOnScreen.y - 450)).toBeLessThan(cell);

    const before = await camera(page);
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x - 40, target.y + 40, { steps: 5 });
    await page.mouse.up();

    expect((await camera(page)).x).not.toBeCloseTo(before.x, 0);
  });
});

describe('The quick maze list', () => {
  test('L opens it without typing, and the arrows preview without touching the URL', async () => {
    const page = await open();
    await openFirstMaze(page);
    const hash = new URL(page.url()).hash;
    const title = await page.locator('h1').textContent();
    await page.keyboard.press('l');
    const filter = page.getByPlaceholder('Filter mazes…');
    await filter.waitFor();

    expect(await filter.inputValue()).toBe('');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      (before) => document.querySelector('h1')?.textContent !== before,
      title
    );

    expect(new URL(page.url()).hash).toBe(hash);
    await page.keyboard.press(']');
    await page.keyboard.press('[');
    expect(await filter.inputValue()).toBe('');

    await page.keyboard.press('Escape');
    await page.waitForFunction(
      (before) => document.querySelector('h1')?.textContent === before,
      title
    );
    expect(new URL(page.url()).hash).toBe(hash);
    expect(await page.locator('#maze-list').count()).toBe(0);
  });

  test('a filter and Enter pin a maze, replacing the URL', async () => {
    const page = await open();
    await openFirstMaze(page);
    const length = await page.evaluate(() => window.history.length);
    await page.keyboard.press('l');
    await page.getByPlaceholder('Filter mazes…').fill('japan2011hef');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'japan2011hef');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.location.hash === '#/repo/halfsize/japan2011hef.txt');

    expect(await page.locator('#maze-list').count()).toBe(0);
    expect(await page.evaluate(() => window.history.length)).toBe(length);
  });

  test('outside the list, ] pins the next maze of the whole list', async () => {
    const page = await open();
    await openFirstMaze(page);
    const keys = await page.evaluate(() =>
      [...document.querySelectorAll('a[data-artboard]')].map((link) => link.getAttribute('href'))
    );
    await page.locator('#canvas').focus();
    await page.keyboard.press(']');

    await page.waitForFunction((next) => window.location.hash === next, keys[7]);
    expect(await mode(page)).toBe('editor');
  });
});

describe('View mode', () => {
  test('a phone opens a maze to look at: one finger pans and a pinch zooms', async () => {
    const page = await open('#/', { width: 390, height: 844, touch: true });
    await page.locator('a[data-artboard]').first().tap();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'editor'
    );

    expect(await page.locator('[data-studio-mode]').getAttribute('data-viewing')).toBe('');
    const session = await page.context().newCDPSession(page);
    const before = await camera(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 200, y: 400 }],
    });
    for (let step = 1; step <= 5; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 200 + step * 10, y: 400 + step * 6 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const panned = await camera(page);

    expect(panned.x - before.x).toBeCloseTo(50, 0);
    expect(panned.y - before.y).toBeCloseTo(30, 0);

    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 170, y: 400, id: 1 },
        { x: 230, y: 400, id: 2 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 140, y: 400, id: 1 },
        { x: 260, y: 400, id: 2 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    expect((await camera(page)).k).toBeCloseTo(panned.k * 2, 1);
  });

  test('a touch on a notebook opens a maze to look at too', async () => {
    const page = await open('#/', { touch: true });
    await page.locator('a[data-artboard]').nth(6).tap();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === 'editor'
    );

    expect(await page.locator('[data-studio-mode]').getAttribute('data-viewing')).toBe('');
  });

  test('a mouse on a notebook does not', async () => {
    const page = await open();
    await openFirstMaze(page);

    expect(await page.locator('[data-studio-mode]').getAttribute('data-viewing')).toBeNull();
  });
});
