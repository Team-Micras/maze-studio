import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';
import { settled } from '@tests/support/ui/animations';
import { artboards, mountApp } from '@tests/support/ui/library-app';
import { showsAmberRoute } from '@tests/support/ui/route-pixels';

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

/**
 * The editor's Routes button: the last of the two, as the library's, inert while a maze is open,
 * comes first.
 */
function editorRoutes() {
  return page.getByRole('button', { name: 'Routes' }).last();
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

  test('changes nothing on hover; the arrows switch at once and a click pins', async () => {
    await mountApp();
    await openMaze();
    const title = document.querySelector('h1')?.textContent;
    await openList();
    const rows = [...document.querySelectorAll<HTMLElement>('[cmdk-item]')];
    const other = rows.find((row) => !row.textContent?.includes(title ?? '')) ?? document.body;
    await userEvent.hover(other);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(document.querySelector('h1')?.textContent).toBe(title);
    await userEvent.keyboard('{ArrowDown}');
    await expect.poll(() => document.querySelector('h1')?.textContent).not.toBe(title);
    const previewed = document.querySelector('h1')?.textContent;
    await userEvent.click(other);
    await expect.poll(() => document.querySelector('#maze-list')).toBeNull();
    expect(document.querySelector('h1')?.textContent).not.toBe(previewed);
  });

  test('keeps the focus ring of the filter whole inside the drawer', async () => {
    await mountApp();
    await openMaze();
    await openList();
    const drawer = document.querySelector('#maze-list')?.getBoundingClientRect();
    const box = document
      .querySelector('[data-slot="command-input-wrapper"]')
      ?.getBoundingClientRect();

    expect(drawer).toBeDefined();
    expect((box?.top ?? 0) - (drawer?.top ?? 0)).toBeGreaterThanOrEqual(4);
    expect((box?.left ?? 0) - (drawer?.left ?? 0)).toBeGreaterThanOrEqual(4);
    expect((drawer?.right ?? 0) - (box?.right ?? 0)).toBeGreaterThanOrEqual(4);
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

describe('The checks of an open maze', () => {
  test.each([
    ['notebook', 'light', 1440, 900],
    ['notebook', 'dark', 1440, 900],
    ['phone', 'light', 390, 844],
    ['phone', 'dark', 390, 844],
  ])(
    'have no accessibility violations open on a %s in the %s theme',
    async (_, theme, width, height) => {
      await page.viewport(width, height);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      await mountApp('#/repo/classic/AAMC15Maze.txt');
      await expect.poll(mode).toBe('editor');
      await userEvent.click(page.getByRole('button', { name: /^Checks/ }));
      await expect.element(page.getByRole('dialog', { name: 'Checks' })).toBeVisible();

      expect(await axeViolations()).toEqual([]);
    }
  );
});

describe('The routes of an open maze', () => {
  test.each([
    ['notebook', 1440, 900],
    ['phone', 390, 844],
  ])(
    'open from the island on a notebook and the menu on a phone, both off until switched on, %s',
    async (layout, width, height) => {
      await page.viewport(width, height);
      document.documentElement.classList.add('dark');
      await mountApp('#/repo/classic/AAMC15Maze.txt');
      await expect.poll(mode).toBe('editor');

      if (layout === 'phone') {
        await userEvent.click(page.getByRole('button', { name: 'More actions' }));
        await userEvent.click(page.getByRole('menuitem', { name: 'Routes' }));
      } else {
        await userEvent.click(editorRoutes());
      }

      await expect.element(page.getByRole('dialog', { name: 'Routes' })).toBeVisible();
      expect(drawn()).toBe(0);
      await userEvent.click(page.getByRole('switch', { name: /Without diagonals/ }));
      await userEvent.click(page.getByRole('switch', { name: /With diagonals/ }));
      await expect.poll(drawn).toBe(2);
      expect(await axeViolations()).toEqual([]);
    }
  );
});

describe('The Routes panel', () => {
  test('left open, stays closed on the next maze while its routes stay drawn', async () => {
    await mountApp('#/repo/classic/AAMC15Maze.txt');
    await expect.poll(mode).toBe('editor');
    await userEvent.click(editorRoutes());
    await expect.element(page.getByRole('dialog', { name: 'Routes' })).toBeVisible();
    await userEvent.click(page.getByRole('switch', { name: /Without diagonals/ }));
    await userEvent.click(page.getByRole('switch', { name: /With diagonals/ }));
    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));
    await expect.poll(mode).toBe('library');
    await openMaze();
    await expect.element(editorRoutes()).toBeVisible();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelectorAll('[data-open-board] [data-route]').length).toBe(2);
  });
});

/** The thumbnail of the seventh artboard, a maze with both routes. */
function thumbnail(): HTMLCanvasElement | null | undefined {
  return artboards()[6]?.querySelector('canvas');
}

/** Whether the library's Routes button shows routes drawn. */
function libraryActive(): boolean {
  return document.querySelector('[data-chrome="library"] [data-active]') !== null;
}

/** How many routes the open board draws. */
function drawn(): number {
  return document.querySelectorAll('[data-open-board] [data-route]').length;
}

/** Opens the library's Routes, flips the switches named, and closes it. */
async function libraryRoutes(...flips: readonly RegExp[]): Promise<void> {
  await userEvent.click(page.getByRole('button', { name: 'Routes' }));
  await expect.element(page.getByRole('dialog', { name: 'Routes' })).toBeVisible();

  await flips.reduce<Promise<void>>(
    (done, name) => done.then(() => userEvent.click(page.getByRole('switch', { name }))),
    Promise.resolve()
  );

  await userEvent.keyboard('{Escape}');
  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
}

describe('The routes the session shows', () => {
  test('are chosen from the library for every thumbnail, with the switches of the Routes panel', async () => {
    await mountApp();

    expect(showsAmberRoute(thumbnail())).toBe(false);
    expect(libraryActive()).toBe(false);
    await libraryRoutes();
    expect(libraryActive()).toBe(false);
    await libraryRoutes(/Without diagonals/, /With diagonals/);
    expect(libraryActive()).toBe(true);
    await expect.poll(() => showsAmberRoute(thumbnail())).toBe(true);

    await openMaze();
    expect(drawn()).toBe(2);
    await userEvent.click(editorRoutes());
    await userEvent.click(page.getByRole('switch', { name: /With diagonals/ }));
    expect(drawn()).toBe(1);

    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));
    await expect.poll(mode).toBe('library');
    expect(libraryActive()).toBe(true);
    await expect.poll(() => showsAmberRoute(thumbnail())).toBe(false);
    await libraryRoutes(/Without diagonals/);
    expect(libraryActive()).toBe(false);

    await openMaze();
    expect(drawn()).toBe(0);
  });

  test('stay drawn on the board all through the flights in and back', async () => {
    await mountApp();
    await libraryRoutes(/Without diagonals/, /With diagonals/);
    await userEvent.click(artboards()[6] ?? document.body);
    await expect.poll(mode).toBe('flying-in');

    expect(drawn()).toBe(2);
    await expect.poll(mode, { timeout: 3000 }).toBe('editor');
    await settled();
    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));
    await expect.poll(mode).toBe('flying-out');

    expect(drawn()).toBe(2);
  });
});

describe('The Changes panel of an open maze', () => {
  test.each([
    ['notebook', 'light', 1440, 900],
    ['notebook', 'dark', 1440, 900],
    ['phone', 'light', 390, 844],
    ['phone', 'dark', 390, 844],
  ])(
    'opens from the menu with nothing changed, without accessibility violations on a %s in the %s theme',
    async (_, theme, width, height) => {
      await page.viewport(width, height);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      await mountApp('#/repo/classic/AAMC15Maze.txt');
      await expect.poll(mode).toBe('editor');
      await userEvent.click(page.getByRole('button', { name: 'More actions' }));
      await userEvent.click(page.getByRole('menuitem', { name: 'Changes' }));
      await expect.element(page.getByText('Nothing changed since the app opened.')).toBeVisible();
      await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull();

      expect(await axeViolations()).toEqual([]);
    }
  );
});

describe('Generate from the editor', () => {
  test('docked, folds every action of the editor but Routes, which changes the routes without closing it', async () => {
    await mountApp('#/repo/classic/AAMC15Maze.txt');
    await expect.poll(mode).toBe('editor');
    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: /^Generate…/ }));
    const generate = page.getByRole('dialog', { name: 'Generate' });
    await expect.element(generate).toBeVisible();

    const outsideLibrary = [...document.querySelectorAll('button')].filter(
      (button) =>
        button.closest('[data-chrome="library"]') === null &&
        (button.getAttribute('aria-label') ?? button.textContent) === 'Routes'
    );

    expect(outsideLibrary).toHaveLength(1);
    expect(generate.getByRole('button', { name: 'Routes' }).query()).toBeNull();
    await expect
      .poll(() => page.getByRole('button', { name: 'More actions' }).element().closest('[inert]'))
      .not.toBeNull();
    await userEvent.click(outsideLibrary[0]);
    await userEvent.click(page.getByRole('switch', { name: /With diagonals/ }));

    await expect.poll(drawn).toBe(1);
    await expect.element(generate).toBeVisible();
  });

  test('stays closed on the next maze when the editor was left with it open', async () => {
    await mountApp();
    await openMaze();
    await userEvent.click(page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(page.getByRole('menuitem', { name: /^Generate…/ }));
    await expect.element(page.getByRole('dialog', { name: 'Generate' })).toBeVisible();

    history.back();
    await expect.poll(mode, { timeout: 3000 }).toBe('library');
    await openMaze(7);

    await expect.element(page.getByRole('dialog', { name: 'Generate' })).not.toBeInTheDocument();
  });
});
