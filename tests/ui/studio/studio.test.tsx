import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';
import { settled } from '@tests/support/ui/animations';
import { artboards, mountApp } from '@tests/support/ui/library-app';

afterEach(async () => {
  document.documentElement.classList.remove('dark');
  await page.viewport(1440, 900);
});

function mode(): string | null | undefined {
  return document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode');
}

async function openMaze(index = 6): Promise<void> {
  await userEvent.click(artboards()[index] ?? document.body);
  await expect.poll(mode, { timeout: 3000 }).toBe('editor');
  await settled();
}

async function openList(): Promise<void> {
  await userEvent.click(page.getByRole('button', { name: 'Maze list' }));
  await expect.element(page.getByPlaceholder('Filter mazes…')).toBeVisible();
}

describe('The quick maze list', () => {
  test('draws a row thumbnail only once the row scrolls into view', async () => {
    await mountApp();
    await openMaze();
    await openList();
    const rows = [...document.querySelectorAll('[cmdk-item]')];
    await expect.poll(() => rows[0]?.querySelector('canvas') !== null).toBe(true);

    expect(rows.length).toBeGreaterThan(500);
    expect(rows.at(-1)?.querySelector('canvas')).toBeNull();
  });

  test('focuses the filter on a notebook, and gives the focus back to the button on Escape', async () => {
    await mountApp();
    await openMaze();
    await openList();

    await expect.element(page.getByPlaceholder('Filter mazes…')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('button', { name: 'Maze list' })).toHaveFocus();
  });

  test('highlights the open maze when it opens', async () => {
    await mountApp();
    await openMaze();
    const title = document.querySelector('h1')?.textContent;
    await openList();

    expect(document.querySelector('[cmdk-item][data-selected="true"]')?.textContent).toContain(
      title
    );
  });

  test('opens as a sheet on a phone, and Escape closes it on the pinned maze', async () => {
    await page.viewport(390, 844);
    await mountApp();
    await openMaze(0);
    const title = document.querySelector('h1')?.textContent;
    await openList();

    expect(document.querySelector('[role="dialog"]#maze-list')).not.toBeNull();
    expect(document.activeElement).not.toBe(page.getByPlaceholder('Filter mazes…').element());
    await expect
      .poll(() => document.querySelector('#maze-list')?.contains(document.activeElement))
      .toBe(true);
    await userEvent.keyboard('{ArrowDown}');
    await expect.poll(() => document.querySelector('h1')?.textContent).not.toBe(title);
    await userEvent.keyboard('{Escape}');
    await expect.poll(() => document.querySelector('h1')?.textContent).toBe(title);
  });

  test.each([
    ['notebook', 'light', 1440, 900],
    ['notebook', 'dark', 1440, 900],
    ['phone', 'light', 390, 844],
    ['phone', 'dark', 390, 844],
  ])(
    'has no accessibility violations open on a %s in the %s theme',
    async (_, theme, width, height) => {
      await page.viewport(width, height);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      await mountApp();
      await openMaze(0);
      await openList();

      expect(await axeViolations()).toEqual([]);
    }
  );
});

describe('An open maze', () => {
  test('has no accessibility violations', async () => {
    await mountApp();
    await openMaze();

    expect(await axeViolations()).toEqual([]);
  });

  test('opened by its route on a fresh load arrives without a flight, and Library goes to the library', async () => {
    await mountApp('#/repo/classic/AAMC15Maze.txt');
    await expect.poll(mode).toBe('editor');
    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));

    await expect.poll(mode).toBe('library');
    expect(window.location.hash).toBe('#/');
  });
});
