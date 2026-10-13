import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { toggleWall, type Maze } from '@/maze';
import {
  boardGeometry,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_ZOOM,
  boardLimits,
  toScreen,
  toWorld,
  type BoardView,
  type Camera,
} from '@/render';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';
import { settled } from '@tests/support/ui/animations';
import { CameraStage, type StageDrawing } from '@/ui/board/camera-stage';
import { useBoardCamera } from '@/ui/board/use-board-camera';
import { BoardHarness } from '@tests/support/ui/board-harness';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';
import { shownCamera } from '@tests/support/ui/shown-camera';
import { pinch, touch } from '@tests/support/ui/touch';
import { thumbnailCache } from '@/ui/board/thumbnail-cache';

let maze: Maze;
let view: BoardView;

beforeEach(async () => {
  maze = await repoMaze(REPO_MAZES.halfsize);
  const geometry = boardGeometry(maze);
  view = {
    board: { x: 0, y: 0, width: geometry.width, height: geometry.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    insets: EDITOR_INSETS,
    zoom: EDITOR_ZOOM,
    keep: EDITOR_KEEP,
  };
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

function stage(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="application"]');

  if (element === null) {
    throw new Error('no stage');
  }

  return element;
}

async function mount(): Promise<Camera> {
  await render(<BoardHarness maze={maze} />);
  await expect
    .poll(() => document.querySelector<HTMLElement>('[data-world]')?.style.transform)
    .toBeTruthy();
  return shownCamera();
}

function wheel(init: WheelEventInit & { clientX?: number; clientY?: number }): WheelEvent {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  stage().dispatchEvent(event);
  return event;
}

function pointer(type: string, init: PointerEventInit): void {
  stage().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      ...init,
    })
  );
}

/** What a drawing on the stage was told, in order. */
type DrawCall = readonly [string, ...unknown[]];

/** A drawing that records its calls, and starts a gesture when `accepts` says so. */
function recorder(calls: DrawCall[], accepts = true): StageDrawing {
  return {
    begin: (point, input) => {
      calls.push(['begin', point.x, input.pointerType]);
      return accepts;
    },
    move: (points, input) => calls.push(['move', points.at(-1)?.x, input.shiftKey]),
    end: () => calls.push(['end']),
    cancel: () => calls.push(['cancel']),
    hover: (point) => calls.push(['hover', point?.x]),
  };
}

const DRAWING_BOARD = { x: 0, y: 0, width: 640, height: 640 } as const;

/** A stage that draws with `drawing` over the editor's board. */
function DrawingStage({ drawing }: { readonly drawing: StageDrawing }) {
  const camera = useBoardCamera({ board: DRAWING_BOARD });

  return (
    <CameraStage className="fixed inset-0" controller={camera} drawing={drawing} label="Drawing">
      <div className="size-[640px]" />
    </CameraStage>
  );
}

/** A move of the primary button to `clientX`, as a coalesced event carries it. */
function moveAt(clientX: number): PointerEvent {
  return new PointerEvent('pointermove', {
    pointerId: 1,
    pointerType: 'mouse',
    buttons: 1,
    clientX,
    clientY: 400,
  });
}

function names(calls: readonly DrawCall[]): string[] {
  return calls.map(([name]) => name);
}

function key(type: 'keydown' | 'keyup', name: string): void {
  stage().dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true }));
}

function expectCamera(actual: Camera, expected: Camera, digits = 4): void {
  expect(actual.k).toBeCloseTo(expected.k, digits);
  expect(actual.x).toBeCloseTo(expected.x, 3);
  expect(actual.y).toBeCloseTo(expected.y, 3);
}

describe('The camera stage', () => {
  test('fits the board between the editor insets when it mounts', async () => {
    const camera = await mount();
    const box = document.querySelector('svg[data-board]')?.getBoundingClientRect();

    expectCamera(camera, boardLimits(view).fit);
    expect(box?.top).toBeCloseTo(EDITOR_INSETS.top, 0);
    expect(box?.bottom).toBeCloseTo(window.innerHeight - EDITOR_INSETS.bottom, 0);
  });

  test('is a labelled application the keyboard can focus', async () => {
    await mount();

    await expect
      .element(page.getByRole('application', { name: 'Maze board' }))
      .toHaveAttribute('aria-roledescription', 'canvas');
    expect(stage().tabIndex).toBe(0);
  });

  test('pans with the wheel against the scroll, and sideways with Shift', async () => {
    const fit = await mount();
    wheel({ deltaX: 10, deltaY: 30 });
    await expect.poll(() => shownCamera().y).toBeCloseTo(fit.y - 30, 3);
    expect(shownCamera().x).toBeCloseTo(fit.x - 10, 3);

    wheel({ deltaY: 3, deltaMode: 1, shiftKey: true });
    await expect.poll(() => shownCamera().x).toBeCloseTo(fit.x - 10 - 48, 3);
  });

  test('zooms with Ctrl and the wheel at the pointer, keeping the point under it', async () => {
    const fit = await mount();
    const at = { x: 500, y: 300 };
    const under = toWorld(fit, at);
    wheel({ deltaY: -100, ctrlKey: true, clientX: at.x, clientY: at.y });

    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * Math.exp(0.25), 4);
    const after = toScreen(shownCamera(), under);
    expect(after.x).toBeCloseTo(at.x, 2);
    expect(after.y).toBeCloseTo(at.y, 2);
  });

  test('keeps the page from scrolling or zooming on the wheel, with or without Ctrl', async () => {
    await mount();

    expect(
      wheel({ deltaY: -100, ctrlKey: true, clientX: 500, clientY: 300 }).defaultPrevented
    ).toBe(true);
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(true);
  });

  test('ignores the wheel while the primary button is down', async () => {
    const fit = await mount();
    wheel({ deltaY: 80, buttons: 1 });
    wheel({ deltaY: -80, ctrlKey: true, buttons: 1 });
    await settled();

    expectCamera(shownCamera(), fit);
  });

  test('keeps the zoom between half and ten times the fit', async () => {
    const fit = await mount();

    for (let step = 0; step < 30; step++) {
      wheel({ deltaY: -400, ctrlKey: true, clientX: 720, clientY: 450 });
    }

    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 10, 4);

    for (let step = 0; step < 60; step++) {
      wheel({ deltaY: 400, ctrlKey: true, clientX: 720, clientY: 450 });
    }

    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 0.5, 4);
  });

  test('keeps 96 pixels of the board on screen however far it pans', async () => {
    await mount();
    wheel({ deltaX: -20_000 });
    await settled();

    await expect
      .poll(() => document.querySelector('svg[data-board]')?.getBoundingClientRect().left)
      .toBeCloseTo(window.innerWidth - 96, 0);
  });

  test('zooms in with + and =, out with -, at the centre and without animation', async () => {
    const fit = await mount();
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const under = toWorld(fit, center);

    key('keydown', '+');
    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 1.25, 4);
    key('keydown', '=');
    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 1.5625, 4);
    key('keydown', '-');
    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 1.25, 4);
    expect(toScreen(shownCamera(), under).x).toBeCloseTo(center.x, 2);
  });

  test('fits again with 0, animating for 260 ms', async () => {
    const fit = await mount();
    key('keydown', '+');
    key('keydown', '+');
    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 1.5625, 4);

    key('keydown', '0');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const halfway = shownCamera().k;
    expect(halfway).toBeLessThan(fit.k * 1.5625);
    expect(halfway).toBeGreaterThan(fit.k);

    await new Promise((resolve) => setTimeout(resolve, 400));
    expectCamera(shownCamera(), fit);
  });

  test('pans with Space and a drag', async () => {
    const fit = await mount();
    key('keydown', ' ');
    await settled();
    pointer('pointerdown', { button: 0, buttons: 1, clientX: 600, clientY: 400 });
    pointer('pointermove', { buttons: 1, clientX: 640, clientY: 380 });
    pointer('pointermove', { buttons: 1, clientX: 700, clientY: 350 });

    await expect.poll(() => shownCamera().x).toBeCloseTo(fit.x + 100, 3);
    expect(shownCamera().y).toBeCloseTo(fit.y - 50, 3);
    expect(stage().hasAttribute('data-panning')).toBe(true);

    pointer('pointerup', { button: 0, buttons: 0, clientX: 700, clientY: 350 });
    key('keyup', ' ');
    await settled();
    pointer('pointerdown', { button: 0, buttons: 1, clientX: 600, clientY: 400 });
    pointer('pointermove', { buttons: 1, clientX: 400, clientY: 400 });
    pointer('pointerup', { button: 0, buttons: 0, clientX: 400, clientY: 400 });
    await settled();

    expect(shownCamera().x).toBeCloseTo(fit.x + 100, 3);
  });

  test('draws with the primary button, keeping the camera, and ends on release', async () => {
    const calls: DrawCall[] = [];
    await render(<DrawingStage drawing={recorder(calls)} />);
    await expect.poll(() => shownCamera().k).toBeGreaterThan(0);
    const fit = shownCamera();
    pointer('pointerdown', { button: 0, buttons: 1, clientX: 600, clientY: 400 });
    pointer('pointermove', { buttons: 1, clientX: 640, clientY: 400, shiftKey: true });
    pointer('pointerup', { button: 0, buttons: 0, clientX: 640, clientY: 400 });
    await settled();

    expect(calls).toEqual([['begin', 600, 'mouse'], ['move', 640, true], ['end']]);
    expectCamera(shownCamera(), fit);
  });

  test('hands the drawing every coalesced position of a move', async () => {
    const moves: number[][] = [];
    const drawing: StageDrawing = {
      ...recorder([]),
      move: (points) => moves.push(points.map((point) => point.x)),
    };
    await render(<DrawingStage drawing={drawing} />);
    await expect.poll(() => shownCamera().k).toBeGreaterThan(0);
    pointer('pointerdown', { button: 0, buttons: 1, clientX: 600, clientY: 400 });
    pointer('pointermove', {
      buttons: 1,
      clientX: 660,
      clientY: 400,
      coalescedEvents: [moveAt(620), moveAt(640), moveAt(660)],
    });
    pointer('pointerup', { button: 0, buttons: 0, clientX: 660, clientY: 400 });

    expect(moves).toEqual([[620, 640, 660]]);
  });

  test('leaves a press the drawing refuses, and pans with Space instead of drawing', async () => {
    const calls: DrawCall[] = [];
    await render(<DrawingStage drawing={recorder(calls, false)} />);
    await expect.poll(() => shownCamera().k).toBeGreaterThan(0);
    pointer('pointerdown', { button: 0, buttons: 1, clientX: 600, clientY: 400 });
    pointer('pointermove', { buttons: 1, clientX: 640, clientY: 400 });
    pointer('pointerup', { button: 0, buttons: 0, clientX: 640, clientY: 400 });

    expect(names(calls)).toEqual(['begin']);

    calls.length = 0;
    const fit = shownCamera();
    key('keydown', ' ');
    await settled();
    pointer('pointerdown', { button: 0, buttons: 1, clientX: 600, clientY: 400 });
    pointer('pointermove', { buttons: 1, clientX: 650, clientY: 400 });
    pointer('pointerup', { button: 0, buttons: 0, clientX: 650, clientY: 400 });
    key('keyup', ' ');

    await expect.poll(() => shownCamera().x).toBeCloseTo(fit.x + 50, 3);
    expect(calls).toEqual([]);
  });

  test('follows the pointer with no button down, and forgets it when it leaves', async () => {
    const calls: DrawCall[] = [];
    await render(<DrawingStage drawing={recorder(calls)} />);
    await expect.poll(() => shownCamera().k).toBeGreaterThan(0);
    pointer('pointermove', { buttons: 0, clientX: 500, clientY: 400 });
    stage().dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        relatedTarget: document.body,
      })
    );

    expect(calls).toEqual([
      ['hover', 500],
      ['hover', undefined],
    ]);
  });

  test('takes the drawing back when a second finger lands, and pinches', async () => {
    const calls: DrawCall[] = [];
    await render(<DrawingStage drawing={recorder(calls)} />);
    await expect.poll(() => shownCamera().k).toBeGreaterThan(0);
    const fit = shownCamera();
    await touch('touchStart', [{ x: 600, y: 400 }]);
    await touch('touchStart', [
      { x: 600, y: 400 },
      { x: 700, y: 400 },
    ]);
    await touch('touchMove', [
      { x: 550, y: 400 },
      { x: 750, y: 400 },
    ]);
    await touch('touchEnd', []);

    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 2, 3);
    expect(names(calls)).toEqual(['begin', 'cancel']);
    expect(calls[0]?.[2]).toBe('touch');
  });

  test('pans with the middle button', async () => {
    const fit = await mount();
    pointer('pointerdown', { button: 1, buttons: 4, clientX: 600, clientY: 400 });
    pointer('pointermove', { buttons: 4, clientX: 560, clientY: 470 });
    pointer('pointerup', { button: 1, buttons: 0, clientX: 560, clientY: 470 });

    await expect.poll(() => shownCamera().x).toBeCloseTo(fit.x - 40, 3);
    expect(shownCamera().y).toBeCloseTo(fit.y + 70, 3);
  });

  test('zooms with a pinch, keeping the world under the fingers', async () => {
    const fit = await mount();
    const middle = { x: 720, y: 450 };
    const under = toWorld(fit, middle);
    await pinch(
      [
        { x: 670, y: 450 },
        { x: 770, y: 450 },
      ],
      [
        { x: 620, y: 450 },
        { x: 820, y: 450 },
      ]
    );

    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 2, 2);
    const after = toScreen(shownCamera(), under);
    expect(after.x).toBeCloseTo(middle.x, 0);
    expect(after.y).toBeCloseTo(middle.y, 0);
  });

  test.each(['light', 'dark'])('has no accessibility violations in the %s theme', async (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    await mount();

    expect(await axeViolations()).toEqual([]);
  });
});

function minimap(): HTMLElement | null {
  return document.querySelector('[data-minimap]');
}

function minimapBoard(): DOMRect {
  const board = document.querySelector('[data-minimap-board]')?.getBoundingClientRect();

  if (board === undefined) {
    throw new Error('no minimap board');
  }

  return board;
}

async function zoomIn(times: number): Promise<Camera> {
  const fit = await mount();

  for (let step = 0; step < times; step++) {
    key('keydown', '+');
  }

  await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * 1.25 ** times, 4);
  await settled();
  return shownCamera();
}

function onMinimap(type: string, share: number, buttons: number): void {
  const board = minimapBoard();
  minimap()?.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      buttons,
      clientX: board.left + board.width * share,
      clientY: board.top + board.height * 0.5,
    })
  );
}

describe('The minimap', () => {
  test('paints the live maze without leaving bitmaps in the shared cache', async () => {
    maze = toggleWall(maze, { direction: 'vertical', x: 7, y: 3 });
    const bytes = thumbnailCache.bytes;
    await zoomIn(2);

    await expect.poll(() => minimap()?.dataset.minimap).toBe('shown');
    expect(thumbnailCache.bytes).toBe(bytes);
  });

  test('ignores a press of the middle button', async () => {
    const camera = await zoomIn(4);
    onMinimap('pointerdown', 0.2, 4);
    onMinimap('pointermove', 0.8, 4);
    await settled();

    expectCamera(shownCamera(), camera);
    expect(minimap()?.hasAttribute('data-dragging')).toBe(false);
  });

  test('grabs while dragging and stops when it loses the pointer', async () => {
    await zoomIn(4);
    onMinimap('pointerdown', 0.3, 1);
    await expect.poll(() => minimap()?.hasAttribute('data-dragging')).toBe(true);
    expect(minimap()?.className).toContain('cursor-grabbing');

    minimap()?.dispatchEvent(
      new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 })
    );
    await expect.poll(() => minimap()?.hasAttribute('data-dragging')).toBe(false);
    expect(minimap()?.className).toContain('cursor-grab');
    const stopped = shownCamera();
    onMinimap('pointermove', 0.8, 1);
    await settled();

    expectCamera(shownCamera(), stopped);
  });

  test('hides at the fit and shows past 1.06 times it', async () => {
    const fit = await mount();

    expect(minimap()?.dataset.minimap).toBe('hidden');
    wheel({ deltaY: -5, ctrlKey: true, clientX: 720, clientY: 450 });
    await expect.poll(() => shownCamera().k).toBeCloseTo(fit.k * Math.exp(0.05), 4);
    expect(minimap()?.dataset.minimap).toBe('hidden');

    key('keydown', '+');
    await expect.poll(() => minimap()?.dataset.minimap).toBe('shown');
    expect(minimap()?.getAttribute('aria-hidden')).toBe('true');
  });

  test('marks the part of the board on screen', async () => {
    const camera = await zoomIn(5);
    const board = minimapBoard();
    const marked = document.querySelector('[data-minimap-view]')?.getBoundingClientRect();
    const scale = board.width / view.board.width;
    const visibleTopLeft = toWorld(camera, { x: 0, y: 0 });

    expect(marked?.width).toBeCloseTo((window.innerWidth / camera.k) * scale, 0);
    expect(marked?.height).toBeCloseTo((window.innerHeight / camera.k) * scale, 0);
    expect((marked?.left ?? 0) - board.left).toBeCloseTo(visibleTopLeft.x * scale, 0);
    expect((marked?.top ?? 0) - board.top).toBeCloseTo(visibleTopLeft.y * scale, 0);
  });

  test('a click on a corner brings that point to the centre, within a cell', async () => {
    await zoomIn(4);
    const board = minimapBoard();
    const target = { x: board.left + board.width * 0.85, y: board.top + board.height * 0.15 };
    const world = {
      x: ((target.x - board.left) / board.width) * view.board.width,
      y: ((target.y - board.top) / board.height) * view.board.height,
    };
    const minimapElement = minimap();
    minimapElement?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: target.x,
        clientY: target.y,
        buttons: 1,
      })
    );
    minimapElement?.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: target.x,
        clientY: target.y,
      })
    );
    await settled();

    const center = toWorld(shownCamera(), { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const cell = boardGeometry(maze).pitch;
    expect(Math.abs(center.x - world.x)).toBeLessThan(cell);
    expect(Math.abs(center.y - world.y)).toBeLessThan(cell);
  });

  test('a drag keeps moving the camera', async () => {
    await zoomIn(4);
    const board = minimapBoard();
    const minimapElement = minimap();
    const at = (share: number) => ({
      clientX: board.left + board.width * share,
      clientY: board.top + board.height * 0.5,
    });
    minimapElement?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        buttons: 1,
        ...at(0.3),
      })
    );
    await settled();
    const first = shownCamera().x;
    minimapElement?.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        buttons: 1,
        ...at(0.5),
      })
    );
    await settled();
    const second = shownCamera().x;
    minimapElement?.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        buttons: 1,
        ...at(0.7),
      })
    );
    await settled();
    const third = shownCamera().x;
    minimapElement?.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    );

    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });
});

describe('The cursor status', () => {
  test('names the cursor cell and its walls in a polite live region', async () => {
    const small = await repoMaze(REPO_MAZES.classic);
    await render(<BoardHarness maze={small} overlays={{ cursor: { x: 0, y: 0 } }} />);
    const status = document.querySelector('[aria-live="polite"]');

    expect(status?.textContent).toBe('Cell (0, 0)  walls east, south, west');
  });
});
