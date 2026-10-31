import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import {
  decodeMazeCode,
  encodeMazeCode,
  mazesEqual,
  parseMazeText,
  toggleWall,
  type Edge,
  type Maze,
} from '@/maze';
import { DATABASE_NAME } from '@/library/database';
import { mazeSvg } from '@/render';
import {
  contentOf,
  edgeMiddle,
  expectSaved,
  mineCount,
  mineId,
  pagePoint,
  repoContent,
  repoText,
  sameMaze,
  storedMine,
} from '@tests/support/e2e/board-page';
import { openPage, waitForMode, expectToast } from '@tests/support/e2e/studio-page';

const app = inject('appUrl');
const ROOT = join(import.meta.dirname, '..', '..');
const CLASSIC = 'classic/AAMC15Maze.txt';
const EDGE: Edge = { direction: 'vertical', x: 6, y: 9 };

declare global {
  interface Window {
    modesSeen?: string[];
    shared?: string;
  }
}

let browser: Browser;
const contexts: BrowserContext[] = [];
const folders: string[] = [];

function scratch(name: string): string {
  const folder = mkdtempSync(join(ROOT, 'node_modules', '.tmp', name));
  folders.push(folder);
  return folder;
}

async function openMaze(hash: string, page?: Page): Promise<Page> {
  const shown = page ?? (await openPage(browser, contexts, app, hash));

  if (page !== undefined) {
    await page.goto(`${app}${hash}`);
  }

  await waitForMode(shown, 'editor');
  return shown;
}

async function clickEdge(page: Page, maze: Maze, edge: Edge): Promise<void> {
  const point = await pagePoint(page, maze, edgeMiddle(edge));
  await page.mouse.click(point.x, point.y);
}

async function menu(page: Page, item: RegExp | string): Promise<void> {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/**
 * Selects `item` of the Export submenu of the ⋯ menu, moving the pointer there in steps as a hand
 * does: a pointer that jumps out of Export in one move closes the submenu.
 */
async function exportMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Export' }).click();
  const target = page.getByRole('menuitem', { name: item });
  const box = await target.boundingBox();

  if (box === null) {
    throw new Error(`${item} is not on screen`);
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await target.click();
}

/** The text of a `.txt` downloaded by `act`, and the name it was offered under. */
async function downloaded(page: Page, act: () => Promise<void>): Promise<[string, string]> {
  const [download] = await Promise.all([page.waitForEvent('download'), act()]);
  const path = join(scratch('download-'), download.suggestedFilename());
  await download.saveAs(path);
  return [download.suggestedFilename(), readFileSync(path, 'utf8')];
}

/** The keys of the settings store. */
function settingsKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    (database) =>
      new Promise<string[]>((resolve) => {
        const request = indexedDB.open(database);
        request.addEventListener('success', () => {
          const keys = request.result.transaction('settings').objectStore('settings').getAllKeys();
          keys.addEventListener('success', () => resolve(keys.result.map(String)));
        });
      }),
    DATABASE_NAME
  );
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await Promise.all(contexts.map((context) => context.close()));
  await browser?.close();

  for (const folder of folders) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe('Copy link', () => {
  test('copies a link that opens the same maze again', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expectToast(page, 'Link copied');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const code = decodeURIComponent(new URL(link).hash.replace('#/m/', ''));
    const decoded = decodeMazeCode(code);

    expect(decoded.ok && mazesEqual(decoded.value.maze, maze)).toBe(true);
    await page.goto(link);
    await waitForMode(page, 'editor');
    expect(await page.locator('h1').textContent()).toBe('AAMC15Maze');
  });

  test('says when the notes after the grid stay out of the link', async () => {
    const page = await openPage(browser, contexts, app);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const file = join(scratch('notes-'), 'noted.txt');
    writeFileSync(file, `${repoText(CLASSIC)}Notes after the grid\n`);
    await page.locator('input[data-open-file]').setInputFiles(file);
    await waitForMode(page, 'editor');
    await page.getByRole('button', { name: 'Copy link' }).click();

    await expectToast(page, 'Notes after the grid are not in the link');
  });

  test('without a clipboard, puts the link in the address bar and says so', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
      document.execCommand = () => false;
    });
    const page = await context.newPage();
    await openMaze(`#/repo/${CLASSIC}`, page);
    await page.getByRole('button', { name: 'Copy link' }).click();

    await expectToast(page, 'Copy failed, link is in the address bar');
    expect(new URL(page.url()).hash).toMatch(/^#\/m\//);
  });

  test('a link that does not decode opens the library and says why', async () => {
    const page = await openPage(browser, contexts, app, '#/m/not-a-maze');

    await expectToast(page, /^That link does not hold a maze/);
    await waitForMode(page, 'library');
    expect(new URL(page.url()).hash).toBe('#/');
  });
});

describe('On a phone', () => {
  test('the menu copies the link and shares it with Web Share', async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    contexts.push(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.addInitScript(() => {
      Object.assign(navigator, {
        share: (data: ShareData) => {
          window.shared = data.url;
          return Promise.resolve();
        },
      });
    });
    const page = await context.newPage();
    await openMaze(`#/repo/${CLASSIC}`, page);

    expect(await page.getByRole('button', { name: 'Copy link' }).count()).toBe(0);
    await menu(page, 'Copy link');
    await expectToast(page, 'Link copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    await menu(page, 'Share…');

    await expect.poll(() => page.evaluate(() => window.shared)).toBe(copied);
    expect(copied).toMatch(/#\/m\//);
  });
});

describe('Download mazefile (.txt)', () => {
  test('downloads a file under a valid name that reads back the same maze', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    const [name, text] = await downloaded(page, () => exportMenu(page, 'Download mazefile (.txt)'));

    expect(name).toBe('AAMC15Maze.txt');
    expect(text).toBe(repoText(CLASSIC));

    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    const [edited, editedText] = await downloaded(page, () =>
      exportMenu(page, 'Download mazefile (.txt)')
    );
    const parsed = parseMazeText(editedText, edited);

    expect(edited).toBe('AAMC15Maze-edited.txt');
    expect(parsed.ok && mazesEqual(parsed.value.maze, toggleWall(maze, EDGE))).toBe(true);
  });
});

describe('Copy SVG and Download SVG', () => {
  test('copy and download the board as an SVG named after the maze', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await exportMenu(page, 'Copy SVG');
    await expectToast(page, 'SVG copied');

    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(mazeSvg(maze));

    const [name, svg] = await downloaded(page, () => exportMenu(page, 'Download SVG'));

    expect(name).toBe('AAMC15Maze.svg');
    expect(svg).toBe(mazeSvg(maze));
  });
});

describe('Copy mazefile (.txt)', () => {
  test('copies the text Download mazefile (.txt) saves', async () => {
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await exportMenu(page, 'Copy mazefile (.txt)');
    await expectToast(page, 'Mazefile copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const [, text] = await downloaded(page, () => exportMenu(page, 'Download mazefile (.txt)'));

    expect(copied).toBe(text);
    expect(copied).toBe(repoText(CLASSIC));
  });
});

describe('The Export menu', () => {
  test('opens and downloads from the keyboard', async () => {
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await page.getByRole('button', { name: 'More actions' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menu').waitFor();
    const focused = () => page.evaluate(() => document.activeElement?.textContent);

    for (let step = 0; step < 12 && (await focused()) !== 'Export'; step++) {
      await page.keyboard.press('ArrowDown');
    }

    await page.locator('[role=menuitem][data-highlighted]', { hasText: 'Export' }).waitFor();
    await expect
      .poll(async () => {
        if ((await focused()) === 'Export') {
          await page.keyboard.press('ArrowRight');
        }
        return focused();
      })
      .toBe('Download mazefile (.txt)');
    const [name] = await downloaded(page, () => page.keyboard.press('Enter'));

    expect(name).toBe('AAMC15Maze.txt');
    expect(await page.getByRole('menu').count()).toBe(0);
  });

  test.each([320, 360, 390])(
    'opens under Export with a tap on a %d px phone and closes with another',
    async (width) => {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        hasTouch: true,
      });
      contexts.push(context);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const page = await context.newPage();
      await openMaze(`#/repo/${CLASSIC}`, page);
      await page.getByRole('button', { name: 'More actions' }).tap();
      const exportItem = page.getByRole('menuitem', { name: 'Export' });
      const items = page.getByRole('menuitem', {
        name: /^(Download|Copy) (mazefile|SVG)/,
      });
      await exportItem.tap();
      await items.nth(3).waitFor();
      const boxes = await items.evaluateAll((elements) =>
        elements.map((element) => {
          const { left, right, bottom } = element.getBoundingClientRect();
          return { left, right, bottom };
        })
      );

      expect(await exportItem.getAttribute('aria-expanded')).toBe('true');
      expect(await page.getByRole('menu').count()).toBe(1);
      expect(boxes).toHaveLength(4);
      expect(boxes.every((box) => box.left >= 0 && box.right <= width && box.bottom <= 844)).toBe(
        true
      );
      await exportItem.tap();

      await expect.poll(() => items.count()).toBe(0);
      expect(await exportItem.getAttribute('aria-expanded')).toBe('false');
      expect(await page.getByRole('menu').count()).toBe(1);
      await exportItem.tap();
      await page.getByRole('menuitem', { name: 'Copy mazefile (.txt)' }).tap();
      await expectToast(page, 'Mazefile copied');
    }
  );
});

describe('Save to My mazes', () => {
  test('keeps a link in My mazes under its own name, and editing would too', async () => {
    const { maze } = await repoContent(CLASSIC);
    const code = encodeMazeCode(maze, { name: 'Shared one' });
    const page = await openMaze(`#/m/${code}`);
    await menu(page, 'Save to My mazes');
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));

    await expect.poll(() => page.locator('h1').textContent()).toBe('Shared one');
    expect(await mineCount(page)).toBe(1);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Export' }).waitFor();
    expect(await page.getByRole('menuitem', { name: 'Save to My mazes' }).count()).toBe(0);
  });

  test('keeps a repository maze not edited under its own name and origin, and edits then save into that copy', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await menu(page, 'Save to My mazes');
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    const id = mineId(page) ?? '';
    const item = await storedMine(page, id);

    expect(item?.name).toBe('AAMC15Maze');
    expect(item?.origin?.path).toBe(CLASSIC);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    expect(mineId(page)).toBe(id);
    expect(await mineCount(page)).toBe(1);
  });

  test('is no change until an edit, and Discard then puts back the state saved', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/m/${encodeMazeCode(maze, { name: 'Shared one' })}`);
    await menu(page, 'Save to My mazes');
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    const id = mineId(page) ?? '';
    await expect.poll(() => storedMine(page, id).then((item) => item?.name)).toBe('Shared one');
    await page.waitForTimeout(300);

    expect(await page.locator('[data-changes-chip]').count()).toBe(0);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await page.getByRole('button', { name: 'Changes in this session: 1' }).click();
    await page.getByRole('button', { name: 'Discard Shared one' }).click();
    await page.getByRole('button', { name: 'Confirm discard of Shared one' }).click();

    await expect
      .poll(async () => {
        const item = await storedMine(page, id);
        return item !== undefined && mazesEqual(contentOf(item).maze, maze);
      })
      .toBe(true);
    expect(await page.locator('[data-changes-chip]').count()).toBe(0);
  });

  test('keeps a .txt in My mazes with its notes', async () => {
    const page = await openPage(browser, contexts, app);
    const file = join(scratch('save-'), 'corridor.txt');
    writeFileSync(file, `${repoText(CLASSIC)}Notes\n`);
    await page.locator('input[data-open-file]').setInputFiles(file);
    await waitForMode(page, 'editor');
    await menu(page, 'Save to My mazes');
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    const item = await storedMine(page, mineId(page) ?? '');
    const decoded = item === undefined ? undefined : decodeMazeCode(item.code);

    expect(item?.name).toBe('corridor');
    expect(decoded?.ok === true ? decoded.value.trailer : undefined).toBe('Notes\n');
  });

  test('keeps the profile chosen before saving, which Discard puts back', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/m/${encodeMazeCode(maze, { name: 'Shared one' })}`);
    const profile = async (name: string): Promise<void> => {
      await page.getByRole('button', { name: /^Checks/ }).click();
      await page.getByRole('dialog', { name: 'Checks' }).getByRole('radio', { name }).click();
      await page.keyboard.press('Escape');
    };
    await profile('Training');
    await menu(page, 'Save to My mazes');
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    const id = mineId(page) ?? '';
    await expect.poll(async () => (await storedMine(page, id))?.profile).toBe('training');

    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await profile('Classic');
    await expect.poll(async () => (await storedMine(page, id))?.profile).toBe('classic');
    await page.getByRole('button', { name: 'Changes in this session: 1' }).click();
    await page.getByRole('button', { name: 'Discard Shared one' }).click();
    await page.getByRole('button', { name: 'Confirm discard of Shared one' }).click();

    await expectSaved(page, sameMaze(maze));
    expect((await storedMine(page, id))?.profile).toBe('training');
  });
});

describe('A .txt file', () => {
  test('stays at #/, the Library button leaves it without a flight, and a reload forgets it', async () => {
    const page = await openPage(browser, contexts, app);
    const file = join(scratch('loose-'), 'corridor.txt');
    writeFileSync(file, repoText(CLASSIC));
    await page.locator('input[data-open-file]').setInputFiles(file);
    await waitForMode(page, 'editor');

    expect(new URL(page.url()).hash).toBe('#/');
    await page.evaluate(() => {
      const seen: string[] = [];
      window.modesSeen = seen;
      new MutationObserver(() =>
        seen.push(
          document.querySelector('[data-studio-mode]')?.getAttribute('data-studio-mode') ?? ''
        )
      ).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-studio-mode'],
      });
    });
    await page.getByRole('button', { name: 'Back to the library' }).click();
    await waitForMode(page, 'library');

    expect(await page.evaluate(() => window.modesSeen?.includes('flying-out'))).toBe(false);
    await page.reload();
    await page.locator('a[data-artboard]').first().waitFor();
    expect(await page.locator('[data-studio-mode]').getAttribute('data-studio-mode')).toBe(
      'library'
    );
  });
});

describe('The ⋯ menu', () => {
  test('fits the board and turns the theme over', async () => {
    const page = await openMaze(`#/repo/${CLASSIC}`);
    const fitted = await page.locator('[data-world]').getAttribute('style');
    await page.locator('#canvas').focus();
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await expect.poll(() => page.locator('[data-world]').getAttribute('style')).not.toBe(fitted);
    await menu(page, /^Fit/);

    await expect.poll(() => page.locator('[data-world]').getAttribute('style')).toBe(fitted);
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await menu(page, /theme$/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(!dark);
  });
});

describe('Rename and Delete', () => {
  test('Rename changes the name shown and the download, and refuses an empty name', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await menu(page, 'Rename…');
    const field = page.getByRole('textbox', { name: 'Name' });
    await field.fill('  ');

    await page.getByText('Name cannot be empty').waitFor();
    expect(await page.getByRole('button', { name: 'Save' }).isDisabled()).toBe(true);
    await field.fill('Practice run');
    await page.keyboard.press('Enter');

    await expect.poll(() => page.locator('h1').textContent()).toBe('Practice run');
    await expect
      .poll(async () => (await storedMine(page, mineId(page) ?? ''))?.name)
      .toBe('Practice run');
    const [name] = await downloaded(page, () => exportMenu(page, 'Download mazefile (.txt)'));
    expect(name).toBe('Practice-run.txt');
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(maze));
  });

  test('a click on the title opens Rename, and Escape leaves the name as it was', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await page.getByRole('button', { name: 'AAMC15Maze (edited)' }).click();
    const field = page
      .getByRole('dialog', { name: 'Rename' })
      .getByRole('textbox', { name: 'Name' });
    await field.fill('Draft name');
    await page.keyboard.press('Escape');

    await expect.poll(() => page.getByRole('dialog', { name: 'Rename' }).count()).toBe(0);
    expect(await page.locator('h1').textContent()).toBe('AAMC15Maze (edited)');
    await page.getByRole('button', { name: 'AAMC15Maze (edited)' }).click();
    await field.fill('Practice run');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => page.locator('h1').textContent()).toBe('Practice run');
    await expect
      .poll(async () => (await storedMine(page, mineId(page) ?? ''))?.name)
      .toBe('Practice run');
  });

  test('Delete asks a second select, then deletes and opens the library on My mazes', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    await page.getByRole('menuitem', { name: 'Confirm delete' }).waitFor();
    expect(await mineCount(page)).toBe(1);
    await page.getByRole('menuitem', { name: 'Confirm delete' }).click();
    await waitForMode(page, 'library');

    expect(new URL(page.url()).hash).toBe('#/?src=mine');
    await expect.poll(() => mineCount(page)).toBe(0);
  });
});

describe('A local folder kept by an older version', () => {
  test('is forgotten on load', async () => {
    const page = await openPage(browser, contexts, app);
    await page.evaluate(
      (database) =>
        new Promise((resolve) => {
          const request = indexedDB.open(database);
          request.addEventListener('success', () => {
            const transaction = request.result.transaction('settings', 'readwrite');
            transaction.objectStore('settings').put({ kind: 'directory' }, 'folder-handle');
            transaction.addEventListener('complete', resolve);
          });
        }),
      DATABASE_NAME
    );
    await page.reload();

    await expect.poll(() => settingsKeys(page)).not.toContain('folder-handle');
  });
});
