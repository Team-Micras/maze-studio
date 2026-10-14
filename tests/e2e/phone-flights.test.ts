import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

const app = inject('appUrl');

declare global {
  interface Window {
    boardWidths?: BoardFrame[];
    recordingBoard?: boolean;
    menus?: number;
    boxes?: string[];
  }
}

/** The open board at one frame: the mode, its box and whether it is seen. */
interface BoardFrame {
  readonly mode: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function center(frame?: BoardFrame): { x: number; y: number } {
  return {
    x: (frame?.x ?? 0) + (frame?.width ?? 0) / 2,
    y: (frame?.y ?? 0) + (frame?.height ?? 0) / 2,
  };
}

let browser: Browser;
const contexts: BrowserContext[] = [];

/** A page as the owner's Android phone shows it: 412 × 892 CSS pixels at 2.625, touch only. */
async function phone(): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 412, height: 892 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(app);
  await page.locator('a[data-artboard]').nth(3).waitFor();
  await page.waitForTimeout(300);
  return page;
}

function mode(page: Page): Promise<string | null> {
  return page.locator('[data-studio-mode]').getAttribute('data-studio-mode');
}

async function waitForMode(page: Page, wanted: string, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (value) =>
      document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') === value,
    wanted,
    { timeout }
  );
}

/** Taps the middle of the artboard `index` of those on screen, as a finger does. */
async function tapArtboard(page: Page, index: number): Promise<void> {
  const box = await page.locator('a[data-artboard] canvas').nth(index).boundingBox();
  await page.touchscreen.tap(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2
  );
}

/** Records the open board's width and the mode at every frame until `stop` is called. */
async function recordBoard(page: Page): Promise<() => Promise<BoardFrame[]>> {
  await page.evaluate(() => {
    const widths: BoardFrame[] = [];
    window.boardWidths = widths;
    window.recordingBoard = true;
    const sample = (): void => {
      const box = document.querySelector('[data-open-board]')?.getBoundingClientRect();
      widths.push({
        mode: document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') ?? '',
        x: box?.x ?? 0,
        y: box?.y ?? 0,
        width: box?.width ?? 0,
        height: box?.height ?? 0,
      });

      if (window.recordingBoard === true) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  return () =>
    page.evaluate(() => {
      window.recordingBoard = false;
      return window.boardWidths ?? [];
    });
}

/** Expects the library on screen and in use: its grid shown, not inert, and an artboard to tap. */
async function expectLibrary(page: Page): Promise<void> {
  await waitForMode(page, 'library', 3000);
  await page.waitForTimeout(900);

  expect(await mode(page)).toBe('library');
  expect(
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-library-scroller]');
      return (
        scroller !== null &&
        !scroller.hasAttribute('inert') &&
        getComputedStyle(scroller).opacity === '1'
      );
    })
  ).toBe(true);
  expect(await page.locator('a[data-artboard]').count()).toBeGreaterThan(0);
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();
});

describe('On a phone, a finger held on a thumbnail', () => {
  test('keeps it still, opens no menu and selects nothing, and opens the maze when lifted', async () => {
    const page = await phone();
    const box = await page.locator('a[data-artboard]').nth(2).boundingBox();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    await page.evaluate(() => {
      const boxes: string[] = [];
      window.menus = 0;
      window.boxes = boxes;
      window.addEventListener('contextmenu', (event) => {
        if (!event.defaultPrevented) {
          window.menus = (window.menus ?? 0) + 1;
        }
      });
      const sample = (): void => {
        const rect = document.querySelectorAll('a[data-artboard]')[2]?.getBoundingClientRect();
        boxes.push(`${rect?.x.toFixed(1)},${rect?.y.toFixed(1)},${rect?.width.toFixed(1)}`);

        if (boxes.length < 50) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });
    const session = await page.context().newCDPSession(page);
    const gesture = session.send('Input.synthesizeTapGesture', {
      x,
      y,
      duration: 900,
      tapCount: 1,
      gestureSourceType: 'touch',
    });
    await page.waitForTimeout(800);
    const held = await page.evaluate(() => ({
      menus: window.menus,
      boxes: new Set(window.boxes).size,
      selected: String(window.getSelection()),
    }));
    await gesture;

    expect(held).toEqual({ menus: 0, boxes: 1, selected: '' });
    await waitForMode(page, 'editor');
  });
});

describe('On a phone, the system Back', () => {
  test('flies the board back without it ever growing first', async () => {
    const page = await phone();
    const entries = await page.evaluate(() => window.history.length);
    await tapArtboard(page, 2);
    await waitForMode(page, 'editor');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.history.length)).toBe(entries + 1);
    await page.waitForTimeout(400);
    const opened = (await page.locator('[data-open-board]').boundingBox())?.width ?? 0;
    const stop = await recordBoard(page);
    await page.evaluate(() => window.history.back());
    await waitForMode(page, 'library');
    const frames = (await stop()).filter((frame) => frame.width > 0);
    const flying = frames.filter((frame) => frame.mode === 'flying-out');
    const last = frames.findLast((frame) => frame.mode === 'editor');
    const first = flying[0];
    const from = center(first);
    const to = center(flying.at(-1));
    const offLine = Math.max(
      ...flying.map((frame) => {
        const point = center(frame);
        const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        return (
          Math.abs(
            (to.y - from.y) * point.x - (to.x - from.x) * point.y + to.x * from.y - to.y * from.x
          ) / length
        );
      })
    );

    expect(flying.length).toBeGreaterThan(10);
    expect(Math.abs((first?.x ?? 0) - (last?.x ?? opened))).toBeLessThanOrEqual(1);
    expect(Math.abs((first?.width ?? 0) - (last?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(offLine).toBeLessThan(2);
    expect(Math.max(...frames.map((frame) => frame.width))).toBeLessThanOrEqual(opened + 1);
    expect(
      flying.every(
        (frame, index) => index === 0 || frame.width <= (flying[index - 1]?.width ?? 0) + 0.5
      )
    ).toBe(true);
  });

  test.each([150, 350, 550])(
    '%i ms into the flight in lands on the library, in use',
    async (delay) => {
      const page = await phone();
      await tapArtboard(page, 2);
      await page.waitForTimeout(delay);
      await page.evaluate(() => window.history.back());

      await expectLibrary(page);
      expect(new URL(page.url()).hash).toMatch(/^(#\/(\?.*)?)?$/);
    }
  );

  test('and Forward right after it leave the maze open, as its route says', async () => {
    const page = await phone();
    await tapArtboard(page, 2);
    await waitForMode(page, 'editor');
    await page.evaluate(() => {
      window.history.back();
      window.setTimeout(() => window.history.forward(), 40);
    });
    await page.waitForTimeout(1500);

    expect(new URL(page.url()).hash).toMatch(/^#\/repo\//);
    expect(await mode(page)).toBe('editor');
    expect(await page.locator('[data-open-board]').count()).toBe(1);
    await page.evaluate(() => window.history.back());
    await expectLibrary(page);
  });

  test('then a tap during the flight back opens that maze, and Back leaves it', async () => {
    const page = await phone();
    await tapArtboard(page, 2);
    await waitForMode(page, 'editor');
    await page.evaluate(() => window.history.back());
    await waitForMode(page, 'flying-out');
    await tapArtboard(page, 0);
    await waitForMode(page, 'editor');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.history.back());

    await expectLibrary(page);
  });

  test('keeps coming back to the library through twenty quick taps and Backs', async () => {
    const page = await phone();
    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    for (let cycle = 0; cycle < 20; cycle++) {
      await tapArtboard(page, Math.floor(random() * 4));
      await page.waitForTimeout(40 + random() * 700);

      if (await page.evaluate(() => window.location.hash.startsWith('#/repo/'))) {
        await page.evaluate(() => window.history.back());
      }

      if (random() < 0.3) {
        await page.waitForTimeout(random() * 200);
        await page.evaluate(() => {
          window.history.forward();
          window.setTimeout(() => window.history.back(), 30);
        });
        await page.waitForTimeout(100);
      }

      await expectLibrary(page);
    }
  });
});
