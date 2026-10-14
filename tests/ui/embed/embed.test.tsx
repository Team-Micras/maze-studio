import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { borderedMaze, encodeMazeCode } from '@/maze';
import { Embed } from '@/ui/embed/embed';
import { EMBED_REFUSED } from '@/ui/embed/embed-maze';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';
import { settled } from '@tests/support/ui/animations';
import { REPO_MAZES } from '@tests/support/ui/repo-mazes';

const CLASSIC_LABEL = 'AAMC15Maze, AAMC, 16 by 16';

afterEach(async () => {
  document.documentElement.classList.remove('dark');
  window.history.replaceState(null, '', window.location.pathname);
  await page.viewport(1440, 900);
});

/** Mounts the embed at `query` and `hash`, as the address of a frame would hold them. */
async function mountEmbed(hash: string, query = '?embed'): Promise<void> {
  window.history.replaceState(null, '', `${window.location.pathname}${query}${hash}`);
  await render(<Embed />);
}

function board(): SVGSVGElement | null {
  return document.querySelector('svg[data-board]');
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

describe('The embed', () => {
  test('shows the maze of a repository route alone, named, with a link to it in the app', async () => {
    await mountEmbed(`#/repo/${REPO_MAZES.classic}`);
    const image = page.getByRole('img', { name: CLASSIC_LABEL });
    await expect.element(image).toBeVisible();
    const link = page.getByRole('link', { name: 'Open in maze-studio' });

    expect(board()?.getAttribute('aria-hidden')).toBeNull();
    await expect
      .element(link)
      .toHaveAttribute(
        'href',
        `${window.location.origin}${window.location.pathname}#/repo/${REPO_MAZES.classic}`
      );
    await expect.element(link).toHaveAttribute('target', '_blank');
    await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      document.querySelectorAll('button, input, [role="application"], [tabindex]')
    ).toHaveLength(0);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });

  test('fits the board in the frame, centred, between margins', async () => {
    await page.viewport(800, 500);
    await mountEmbed(`#/repo/${REPO_MAZES.classic}`);
    await expect.element(page.getByRole('img', { name: CLASSIC_LABEL })).toBeVisible();
    const box = board()?.getBoundingClientRect();

    expect(box?.height).toBeCloseTo(500 - 32, 0);
    expect(box?.width).toBeCloseTo(500 - 32, 0);
    expect(box?.left).toBeCloseTo((800 - (box?.width ?? 0)) / 2, 0);
  });

  test('lets the wheel through, so the page around the frame scrolls', async () => {
    await mountEmbed(`#/repo/${REPO_MAZES.classic}`);
    await expect.element(page.getByRole('img', { name: CLASSIC_LABEL })).toBeVisible();
    const wheel = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    board()?.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
  });

  test('shows the maze of a link, and keeps a forced theme in its link out', async () => {
    const code = encodeMazeCode(borderedMaze(5, 3), { name: 'Club final' });
    await mountEmbed(`#/m/${code}`, '?embed&theme=dark');

    await expect.element(page.getByRole('img', { name: 'Club final, 5 by 3' })).toBeVisible();
    await expect
      .element(page.getByRole('link', { name: 'Open in maze-studio' }))
      .toHaveAttribute(
        'href',
        `${window.location.origin}${window.location.pathname}?theme=dark#/m/${code}`
      );
    expect(isDark()).toBe(true);
  });

  test('follows the hash to another maze', async () => {
    await mountEmbed(`#/repo/${REPO_MAZES.classic}`);
    await expect.element(page.getByRole('img', { name: CLASSIC_LABEL })).toBeVisible();
    window.location.hash = `#/repo/${REPO_MAZES.halfsize}`;

    await expect
      .element(page.getByRole('img', { name: 'japan2016hef, Japan, 32 by 32' }))
      .toBeVisible();
  });

  test.each([
    ['My mazes', '#/mine/6f1c0b2e-1d7a-4c35-9f43-8a0f2b51e9aa', EMBED_REFUSED],
    ['the folder', '#/folder/maze.txt', EMBED_REFUSED],
    ['the library', '#/', EMBED_REFUSED],
    ['a path the repository lacks', '#/repo/classic/x.txt', 'No maze at classic/x.txt'],
  ])('refuses %s with a sentence and no board', async (_where, hash, message) => {
    await mountEmbed(hash);

    await expect.element(page.getByText(message)).toBeVisible();
    expect(board()).toBeNull();
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  test('passes axe on a maze and on a refusal', async () => {
    await mountEmbed(`#/repo/${REPO_MAZES.classic}`);
    await expect.element(page.getByRole('img', { name: CLASSIC_LABEL })).toBeVisible();

    expect(await axeViolations()).toEqual([]);

    document.documentElement.classList.add('dark');
    expect(await axeViolations()).toEqual([]);

    window.location.hash = '#/mine/1';
    await expect.element(page.getByText(EMBED_REFUSED)).toBeVisible();
    expect(await axeViolations()).toEqual([]);
  });
});

describe('Screenshots of the embed', () => {
  test.each(['light', 'dark'])('a 16×16 maze in a 4:3 frame, %s', async (theme) => {
    await page.viewport(640, 480);
    await mountEmbed(`#/repo/${REPO_MAZES.classic}`, `?embed&theme=${theme}`);
    await expect.element(page.getByRole('img', { name: CLASSIC_LABEL })).toBeVisible();
    await settled();

    await expect.element(page.getByRole('main')).toMatchScreenshot(`16x16-${theme}`);
  });
});
