import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import '@/ui/styles.css';
import { seriousViolations } from '@tests/support/axe-check';
import { settled } from '@tests/support/ui/animations';
import { artboards, mountApp } from '@tests/support/ui/library-app';

const COLUMNS_AT_1440 = 5;
const INSETS = { top: 112, bottom: 72 };

afterEach(async () => {
  document.documentElement.classList.remove('dark');
  await page.viewport(1440, 900);
});

function stage(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="application"]');

  if (element === null) {
    throw new Error('no library canvas');
  }

  return element;
}

function onScreen(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

function rowsOnScreen(): number {
  return new Set(
    artboards()
      .filter(onScreen)
      .map((board) => Math.round(board.getBoundingClientRect().bottom))
  ).size;
}

async function scroll(deltaY: number): Promise<void> {
  stage().dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
  await settled();
}

describe('The library canvas', () => {
  test('mounts only the rows on screen and one more above and below', async () => {
    await mountApp();

    expect(artboards().length).toBeLessThanOrEqual((rowsOnScreen() + 1) * COLUMNS_AT_1440);

    await scroll(4000);
    const first = artboards()[0]?.getAttribute('data-artboard');

    expect(artboards().length).toBeLessThanOrEqual((rowsOnScreen() + 2) * COLUMNS_AT_1440);
    expect(artboards().length).toBeGreaterThanOrEqual(rowsOnScreen() * COLUMNS_AT_1440);
    expect(first).not.toBe('repo:classic/001-anomaly-test.txt');
  });

  test('names each artboard by maze, competition and size, as a link that opens it', async () => {
    await mountApp('#/?q=japan2011hef');

    await expect
      .element(page.getByRole('link', { name: 'japan2011hef, Japan, 32 by 32' }))
      .toHaveAttribute('href', '#/repo/halfsize/japan2011hef.txt');
  });

  test('Tab onto an artboard below the screen brings it in and keeps it mounted', async () => {
    await mountApp();
    const below = artboards().find(
      (board) => board.getBoundingClientRect().top > window.innerHeight
    );
    const before = below === undefined ? -1 : artboards().indexOf(below) - 1;
    artboards()[before]?.focus();
    await userEvent.tab();
    await settled();

    expect(document.activeElement).toBe(below);
    const box = below?.getBoundingClientRect();
    expect(box?.top).toBeGreaterThanOrEqual(INSETS.top - 1);
    expect(box?.bottom).toBeLessThanOrEqual(window.innerHeight - INSETS.bottom + 1);

    await scroll(20_000);

    expect(below === undefined ? false : document.contains(below)).toBe(true);
    expect(below === undefined ? true : onScreen(below)).toBe(false);
  });

  test('a click on an artboard half below the insets does not move the camera', async () => {
    await mountApp();
    const world = document.querySelector<HTMLElement>('[data-world]');
    const before = world?.style.transform;
    const cut = artboards().find((board) => {
      const box = board.getBoundingClientRect();
      return (
        box.top < window.innerHeight - INSETS.bottom &&
        box.bottom > window.innerHeight - INSETS.bottom
      );
    });
    window.addEventListener('click', (event) => event.preventDefault(), {
      capture: true,
      once: true,
    });
    await userEvent.click(cut ?? document.body, { position: { x: 20, y: 20 } });
    await settled();

    expect(cut).toBeDefined();
    expect(document.activeElement).toBe(cut);
    expect(world?.style.transform).toBe(before);
  });
});

describe('Search and filters', () => {
  test('21 shows the six 21×21 mazes', async () => {
    await mountApp();
    await userEvent.fill(page.getByRole('searchbox', { name: 'Search mazes' }), '21');

    await expect.poll(() => artboards().length).toBe(6);
    expect(
      artboards().every((board) => board.getAttribute('aria-label')?.endsWith('21 by 21'))
    ).toBe(true);
    expect(window.location.hash).toBe('#/?q=21');
  });

  test('japan 2011 finds japan2011hef and nothing from another year', async () => {
    await mountApp('#/?q=japan+2011');

    await expect.poll(() => artboards().length).toBeGreaterThan(0);
    const labels = artboards().map((board) => board.getAttribute('aria-label') ?? '');
    expect(labels.some((label) => label.startsWith('japan2011hef,'))).toBe(true);
    expect(labels.every((label) => label.includes('2011'))).toBe(true);
  });

  test('writes the source and the category into the URL, and reads them back', async () => {
    await mountApp();
    await userEvent.click(page.getByRole('radio', { name: 'Half size' }));

    await expect.poll(() => window.location.hash).toBe('#/?cat=halfsize');
    await expect
      .poll(() =>
        artboards().every((board) => board.getAttribute('href')?.startsWith('#/repo/halfsize/'))
      )
      .toBe(true);

    await userEvent.click(page.getByRole('radio', { name: 'Half size' }));
    await expect.poll(() => window.location.hash).toBe('#/');
  });

  test('reads the filter back from the URL', async () => {
    await mountApp('#/?cat=training');

    await expect
      .element(page.getByRole('radio', { name: 'Training' }))
      .toHaveAttribute('aria-checked', 'true');
    expect(
      artboards().every((board) => board.getAttribute('href')?.startsWith('#/repo/training/'))
    ).toBe(true);
  });

  test('says Mine is empty, and that nothing matches a search', async () => {
    await mountApp();
    await userEvent.click(page.getByRole('radio', { name: 'Mine' }));

    await expect.element(page.getByRole('heading', { name: 'Nothing in Mine yet' })).toBeVisible();
    expect(window.location.hash).toBe('#/?src=mine');

    await userEvent.click(page.getByRole('radio', { name: 'Repo' }));
    await userEvent.fill(page.getByRole('searchbox', { name: 'Search mazes' }), 'no such maze');
    await expect.element(page.getByRole('heading', { name: 'No mazes match' })).toBeVisible();
  });

  test('/ focuses the search from the canvas and never types itself', async () => {
    await mountApp();
    stage().focus();
    await userEvent.keyboard('/');

    await expect.element(page.getByRole('searchbox', { name: 'Search mazes' })).toHaveFocus();
    expect(page.getByRole('searchbox', { name: 'Search mazes' }).element()).toHaveProperty(
      'value',
      ''
    );
  });
});

describe('The library zoom', () => {
  test('shows the zoom of the fit and changes it with the buttons and the keys', async () => {
    await mountApp();
    const zoom = page.getByRole('status', { name: 'Zoom' });

    await expect.element(zoom).toHaveTextContent('100%');
    await userEvent.click(page.getByRole('button', { name: 'Zoom in' }));
    await expect.element(zoom).toHaveTextContent('125%');
    stage().focus();
    await userEvent.keyboard('-');
    await expect.element(zoom).toHaveTextContent('100%');
  });
});

describe('Accessibility of the library', () => {
  test.each([
    ['notebook', 'light', 1440, 900],
    ['notebook', 'dark', 1440, 900],
    ['phone', 'light', 390, 844],
    ['phone', 'dark', 390, 844],
  ])('has no serious violations on a %s in the %s theme', async (_, theme, width, height) => {
    await page.viewport(width, height);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    await mountApp();

    expect(await seriousViolations()).toEqual([]);
  });
});
