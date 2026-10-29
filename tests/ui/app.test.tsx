import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { MAZEFILES } from '@/library/mazefiles';
import { loadSnapshot } from '@/library/snapshot';
import { encodeMazeCode } from '@/maze';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';
import { artboards, mountApp } from '@tests/support/ui/library-app';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

const FILE = `o---o---o
|       |
o   o   o
| S   G |
o---o---o
`;

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[data-open-file]');

  if (input === null) {
    throw new Error('no file input');
  }

  return input;
}

async function mountOnMaze(hash: string): Promise<void> {
  window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
  const { render } = await import('vitest-browser-react');
  const { App } = await import('@/ui/app');
  await render(<App />);
}

describe('Opening a maze', () => {
  test('from the library pushes its route, and Library goes back to it in the history', async () => {
    await mountApp('#/?q=japan2011hef');
    const length = window.history.length;
    await userEvent.click(page.getByRole('link', { name: /^japan2011hef,/ }));

    await expect
      .element(page.getByRole('heading', { level: 1, name: 'japan2011hef' }))
      .toBeVisible();
    await expect.element(page.getByText('Half size, 32 × 32')).toBeVisible();
    expect(window.location.hash).toBe('#/repo/halfsize/japan2011hef.txt');
    expect(window.history.length).toBe(length + 1);

    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));
    await expect.poll(() => window.location.hash).toBe('#/?q=japan2011hef');
    await expect.poll(() => artboards().length).toBe(1);
    expect(window.history.length).toBe(length + 1);
  });

  test('from its route on a fresh load, with Library going to the library', async () => {
    await mountOnMaze('#/repo/classic/AAMC15Maze.txt');

    await expect.element(page.getByRole('heading', { level: 1, name: 'AAMC15Maze' })).toBeVisible();
    await expect
      .element(page.getByRole('application', { name: 'AAMC15Maze, maze board' }))
      .toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));
    await expect.poll(() => window.location.hash).toBe('#/');
  });

  test('from a link, with the name the link carries', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    await mountOnMaze(`#/m/${encodeMazeCode(maze, { name: 'Club final' })}`);

    await expect.element(page.getByRole('heading', { level: 1, name: 'Club final' })).toBeVisible();
    await expect.element(page.getByText('Opened from a link')).toBeVisible();
  });

  test('a link that does not decode opens the library and says why', async () => {
    await mountOnMaze('#/m/AAAA');

    await expect.element(page.getByText(/^That link does not hold a maze \(/)).toBeVisible();
    await expect.poll(() => window.location.hash).toBe('#/');
  });

  test('a path the repository does not have opens the library and says so', async () => {
    await mountOnMaze('#/repo/classic/nowhere.txt');

    await expect
      .element(page.getByText('No maze at classic/nowhere.txt. Pick one from the library'))
      .toBeVisible();
    await expect.poll(() => window.location.hash).toBe('#/');
    expect(
      [...document.querySelectorAll('ol li [translate="no"]')].map((span) => span.textContent)
    ).toEqual(['classic/nowhere.txt']);
  });
});

describe('The last filter of the library', () => {
  test('a maze the library lacks goes back to the last filter', async () => {
    await mountApp('#/?cat=classic');
    window.location.hash = '#/repo/classic/nowhere.txt';
    await expect
      .element(page.getByText('No maze at classic/nowhere.txt. Pick one from the library'))
      .toBeVisible();
    await expect.poll(() => window.location.hash).toBe('#/?cat=classic');
  });

  test('Library pushes the last filter when the library is not below', async () => {
    await mountApp('#/?q=japan2011hef');
    window.location.hash = '#/repo/classic/AAMC15Maze.txt';
    await expect.element(page.getByRole('heading', { level: 1, name: 'AAMC15Maze' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));
    await expect.poll(() => window.location.hash).toBe('#/?q=japan2011hef');
  });
});

describe('Opening a .txt file', () => {
  test('shows the maze without a route of its own, and Library closes it', async () => {
    await mountApp('#/?cat=classic');
    await userEvent.upload(fileInput(), new File([FILE], 'tiny-maze.txt', { type: 'text/plain' }));

    await expect.element(page.getByRole('heading', { level: 1, name: 'tiny-maze' })).toBeVisible();
    await expect.element(page.getByText('Opened from a file')).toBeVisible();
    expect(window.location.hash).toBe('#/?cat=classic');

    await userEvent.click(page.getByRole('button', { name: 'Back to the library' }));
    await expect.poll(() => artboards().length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('#/?cat=classic');
  });

  test('says what is wrong with a file that is no maze, and changes nothing', async () => {
    await mountApp();
    await userEvent.upload(fileInput(), new File(['hello\n'], 'notes.txt', { type: 'text/plain' }));

    await expect
      .element(page.getByText(/^Could not read notes\.txt \(.+\)\. Pick a mazefiles \.txt$/))
      .toBeVisible();
    expect(artboards().length).toBeGreaterThan(0);
  });
});

describe('Opening a file too large to be a maze', () => {
  test('refuses it with a toast, without reading it', async () => {
    await mountApp();
    const large = new File([new Uint8Array(1024 * 1024 + 1)], 'huge.txt', { type: 'text/plain' });
    await userEvent.upload(fileInput(), large);

    await expect
      .element(page.getByText('Could not read huge.txt (larger than 1 MiB). Pick a mazefiles .txt'))
      .toBeVisible();
    expect(artboards().length).toBeGreaterThan(0);
  });
});

describe('The shell', () => {
  test('credits the mazefiles repository with its commit', async () => {
    await mountApp();

    await expect
      .element(page.getByRole('link', { name: 'micromouseonline/mazefiles' }))
      .toHaveAttribute('href', MAZEFILES.url);
    const snapshot = await loadSnapshot();
    await expect
      .element(page.getByText(new RegExp(`^${snapshot.files.length} mazes from`)))
      .toBeVisible();
    await expect.element(page.getByText(snapshot.commit.slice(0, 7))).toBeVisible();
  });

  test('switches the theme for the session, with the desk colour in theme-color', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    await mountApp();
    const dark = document.documentElement.classList.contains('dark');
    await userEvent.click(page.getByRole('button', { name: /^Switch to the (light|dark) theme$/ }));

    expect(document.documentElement.classList.contains('dark')).toBe(!dark);
    expect(meta.content).toBe(dark ? '#e3e3e3' : '#191919');
    meta.remove();
  });

  test('has a skip link that puts the focus on the first maze of the library', async () => {
    await mountApp();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    await userEvent.tab();

    await expect.element(page.getByRole('link', { name: 'Skip to the content' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(document.activeElement).toBe(document.querySelector('a[data-artboard]'));
    expect(window.location.hash).toBe('#/');
  });

  test('has a skip link that puts the focus on the canvas of an open maze', async () => {
    await mountOnMaze('#/repo/classic/AAMC15Maze.txt');
    await expect.element(page.getByRole('application')).toBeInTheDocument();
    page.getByRole('link', { name: 'Skip to the content' }).element().focus();
    await userEvent.keyboard('{Enter}');

    expect(document.activeElement?.getAttribute('role')).toBe('application');
  });

  test.each(['light', 'dark'])(
    'a maze has no accessibility violations in the %s theme',
    async (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      await mountOnMaze('#/repo/classic/AAMC15Maze.txt');
      await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect
        .poll(() => {
          const chrome = document.querySelector('[data-chrome="editor"]');
          return chrome === null || chrome.hasAttribute('data-hidden')
            ? 0
            : Number(getComputedStyle(chrome).opacity);
        })
        .toBe(1);

      expect(await axeViolations()).toEqual([]);
    }
  );
});
