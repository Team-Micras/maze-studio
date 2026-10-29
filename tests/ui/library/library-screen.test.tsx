import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { loadSnapshot, repoCatalog } from '@/library';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';
import { settled } from '@tests/support/ui/animations';
import { artboards, mountApp } from '@tests/support/ui/library-app';

const COLUMNS_AT_1440 = 5;
const INSETS = { top: 112, bottom: 72 };

afterEach(async () => {
  document.documentElement.classList.remove('dark');
  await page.viewport(1440, 900);
  scroller()?.scrollTo({ top: 0, behavior: 'instant' });
});

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

function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-library-scroller]');
}

function rowTops(): number {
  return new Set(artboards().map((board) => Math.round(board.getBoundingClientRect().top))).size;
}

function firstRow(): number {
  const bottom = Math.round(artboards()[0]?.getBoundingClientRect().bottom ?? 0);
  return artboards().filter((board) => Math.round(board.getBoundingClientRect().bottom) === bottom)
    .length;
}

async function scrollTo(top: number): Promise<void> {
  scroller()?.scrollTo({ top, behavior: 'instant' });
  await settled();
}

describe('The library grid', () => {
  test('scrolls with the page, mounting only the rows on screen and one more above and below', async () => {
    await mountApp();

    expect(scroller()?.scrollHeight).toBeGreaterThan(window.innerHeight * 10);
    expect(getComputedStyle(scroller() ?? document.body).overscrollBehaviorY).toBe('contain');
    expect(artboards().length).toBeLessThanOrEqual((rowsOnScreen() + 1) * COLUMNS_AT_1440);

    await scrollTo(4000);
    await expect
      .poll(() => artboards()[0]?.getAttribute('data-artboard'))
      .not.toBe('repo:classic/001-anomaly-test.txt');
    await settled();

    expect(scroller()?.scrollTop).toBe(4000);
    expect(artboards().length).toBeLessThanOrEqual((rowsOnScreen() + 2) * COLUMNS_AT_1440);
    expect(artboards().length).toBeGreaterThanOrEqual(rowsOnScreen() * COLUMNS_AT_1440);
  });

  test('lays the columns out to the width, and again as it changes', async () => {
    await mountApp();
    expect(firstRow()).toBe(COLUMNS_AT_1440);
    await page.viewport(1000, 900);
    await expect.poll(firstRow).toBe(3);
    expect(rowTops()).toBeGreaterThan(1);
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

    await scrollTo(20_000);

    expect(below === undefined ? false : document.contains(below)).toBe(true);
    expect(below === undefined ? true : onScreen(below)).toBe(false);
  });

  test('Shift+Tab onto an artboard under the top islands scrolls it out from under them', async () => {
    await mountApp();
    const second = artboards()[COLUMNS_AT_1440];
    const top = (second?.getBoundingClientRect().top ?? 0) + (scroller()?.scrollTop ?? 0);
    await scrollTo(top - 40);
    const under = artboards().find((board) => board.dataset.artboard === second?.dataset.artboard);
    const next = under === undefined ? undefined : artboards()[artboards().indexOf(under) + 1];
    next?.focus();
    await userEvent.tab({ shift: true });
    await settled();

    expect(document.activeElement).toBe(under);
    expect(under?.getBoundingClientRect().top).toBeGreaterThanOrEqual(INSETS.top - 1);
  });

  test('Page Down and End scroll the grid when nothing has the focus', async () => {
    await mountApp();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    await userEvent.keyboard('{PageDown}');
    await expect.poll(() => scroller()?.scrollTop).toBeGreaterThan(500);
    await userEvent.keyboard('{End}');
    await expect
      .poll(() => (scroller()?.scrollTop ?? 0) + (scroller()?.clientHeight ?? 0))
      .toBe(scroller()?.scrollHeight);
  });

  test('a click on an artboard half below the insets does not scroll the page', async () => {
    await mountApp();
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
    expect(scroller()?.scrollTop).toBe(0);
  });
});

describe('The credit', () => {
  test.each([
    ['phone', 390, 844],
    ['small phone', 360, 780],
    ['notebook', 1440, 900],
  ])('links maze-studio on GitHub on one untruncated line on a %s', async (_, width, height) => {
    await page.viewport(width, height);
    await mountApp();
    const link = page.getByRole('link', { name: 'maze-studio on GitHub' });
    const credit = link.element().closest('p');
    const text = credit?.querySelector('span');
    const box = link.element().getBoundingClientRect();

    await expect
      .element(link)
      .toHaveAttribute('href', 'https://github.com/Team-Micras/maze-studio');
    expect(credit?.getBoundingClientRect().height).toBe(32);
    expect(text?.scrollWidth).toBeLessThanOrEqual(text?.clientWidth ?? 0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
  });
});

describe('Search and filters', () => {
  test('21 shows every 21×21 maze', async () => {
    const expected = repoCatalog((await loadSnapshot()).files).filter(
      (maze) => maze.width === 21 && maze.height === 21
    ).length;
    await mountApp();
    await userEvent.fill(page.getByRole('searchbox', { name: 'Search mazes' }), '21');

    await expect.poll(() => artboards().length).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(6);
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

  test('says My mazes is empty, and that nothing matches a search', async () => {
    await mountApp();
    await userEvent.click(page.getByRole('radio', { name: 'My mazes' }));

    await expect
      .element(page.getByRole('heading', { name: 'Nothing in My mazes yet' }))
      .toBeVisible();
    expect(window.location.hash).toBe('#/?src=mine');
    const empty = page
      .getByRole('heading', { name: 'Nothing in My mazes yet' })
      .element().parentElement;
    expect(empty?.querySelector('button')?.textContent).toBe('New maze');

    await userEvent.click(page.getByRole('radio', { name: 'Repo' }));
    await userEvent.fill(page.getByRole('searchbox', { name: 'Search mazes' }), 'no such maze');
    await expect.element(page.getByRole('heading', { name: 'No mazes match' })).toBeVisible();
    const none = page.getByRole('heading', { name: 'No mazes match' }).element().parentElement;
    expect(none?.querySelector('button')).toBeNull();
  });

  test('/ focuses the search from the canvas and never types itself', async () => {
    await mountApp();
    artboards()[0]?.focus();
    await userEvent.keyboard('/');

    await expect.element(page.getByRole('searchbox', { name: 'Search mazes' })).toHaveFocus();
    expect(page.getByRole('searchbox', { name: 'Search mazes' }).element()).toHaveProperty(
      'value',
      ''
    );
  });
});

describe('Filtering', () => {
  test('replaces the history entry as the search is typed, never adds one', async () => {
    await mountApp();
    const length = window.history.length;
    await userEvent.type(page.getByRole('searchbox', { name: 'Search mazes' }), 'japan');

    await expect.poll(() => window.location.hash).toBe('#/?q=japan');
    expect(window.history.length).toBe(length);
  });

  test('goes back to the top of the grid after the filter changes', async () => {
    await mountApp();
    await scrollTo(3000);
    await userEvent.click(page.getByRole('radio', { name: 'Classic' }));

    await expect.poll(() => scroller()?.scrollTop, { timeout: 2000 }).toBe(0);
  });

  test('slides the artboards that stay mounted to their new places', async () => {
    await mountApp();
    const moving = artboards().find(
      (board) => board.dataset.artboard === 'repo:classic/AAMC15Maze.txt'
    );
    await userEvent.fill(page.getByRole('searchbox', { name: 'Search mazes' }), 'AAMC');

    await expect
      .poll(() =>
        document
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSTransition &&
              animation.transitionProperty === 'transform' &&
              animation.effect instanceof KeyframeEffect &&
              animation.effect.target === moving
          )
      )
      .toBe(true);
    expect(moving === undefined ? false : document.contains(moving)).toBe(true);
  });

  test('announces an empty result through a live region that was already there', async () => {
    await mountApp();
    const region = document.querySelector('p[aria-live="polite"]');

    expect(region?.textContent).toBe('');
    await userEvent.fill(page.getByRole('searchbox', { name: 'Search mazes' }), 'no such maze');
    await expect.poll(() => region?.textContent).toBe('No mazes match');
    expect(document.querySelector('p[aria-live="polite"]')).toBe(region);
  });

  test('names the search field q, as a form would send it', async () => {
    await mountApp();

    await expect
      .element(page.getByRole('searchbox', { name: 'Search mazes' }))
      .toHaveAttribute('name', 'q');
  });
});

describe('Accessibility of the library', () => {
  test.each([
    ['notebook', 'light', 1440, 900],
    ['notebook', 'dark', 1440, 900],
    ['phone', 'light', 390, 844],
    ['phone', 'dark', 390, 844],
  ])('has no accessibility violations on a %s in the %s theme', async (_, theme, width, height) => {
    await page.viewport(width, height);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    await mountApp();

    expect(await axeViolations()).toEqual([]);
  });
});
