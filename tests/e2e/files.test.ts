import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';

import {
  decodeMazeCode,
  encodeMazeCode,
  mazesEqual,
  parseMazeText,
  serializeMazeText,
  toggleWall,
  type Edge,
  type Maze,
} from '@/maze';
import { DATABASE_NAME } from '@/library/database';
import {
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
    permissionAsks?: boolean[];
    refuseRead?: boolean;
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

/** The text of a `.txt` downloaded by `act`, and the name it was offered under. */
async function downloaded(page: Page, act: () => Promise<void>): Promise<[string, string]> {
  const [download] = await Promise.all([page.waitForEvent('download'), act()]);
  const path = join(scratch('download-'), download.suggestedFilename());
  await download.saveAs(path);
  return [download.suggestedFilename(), readFileSync(path, 'utf8')];
}

/**
 * A persistent context, where a folder handle can go in and out of IndexedDB, whose picker gives a
 * folder `mazes` of the origin's private file system and whose permissions are recorded: whether
 * each request came with a user's gesture, and, when `refuseRead` is set, no read access.
 */
async function folderContext(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(scratch('profile-'), {
    viewport: { width: 1440, height: 900 },
  });
  contexts.push(context);
  await context.addInitScript(() => {
    window.permissionAsks = [];
    Object.assign(navigator.storage, { persisted: () => Promise.resolve(true) });
    Object.assign(window, {
      showDirectoryPicker: async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('mazes', { create: true }),
    });
    Object.assign(FileSystemHandle.prototype, {
      queryPermission: (descriptor: { mode: string }) =>
        Promise.resolve(
          descriptor.mode === 'readwrite' || window.refuseRead === true ? 'prompt' : 'granted'
        ),
      requestPermission: () => {
        window.permissionAsks?.push(navigator.userActivation.isActive);
        return Promise.resolve('granted');
      },
    });
  });
  return context;
}

/** Writes `files` into the private folder `mazes` of the page's origin. */
async function fillFolder(page: Page, files: Record<string, string>): Promise<void> {
  await page.evaluate(async (entries) => {
    const folder = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('mazes', { create: true });

    for (const [name, text] of Object.entries(entries)) {
      const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    }
  }, files);
}

/** The keys of the settings store, where the folder's handle is kept. */
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

function folderText(page: Page, name: string): Promise<string> {
  return page.evaluate(async (file) => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('mazes');
    return (await (await folder.getFileHandle(file)).getFile()).text();
  }, name);
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

describe('Download .txt', () => {
  test('downloads a file under a valid name that reads back the same maze', async () => {
    const { maze } = await repoContent(CLASSIC);
    const page = await openMaze(`#/repo/${CLASSIC}`);
    const [name, text] = await downloaded(page, () => menu(page, 'Download .txt'));

    expect(name).toBe('AAMC15Maze.txt');
    expect(text).toBe(repoText(CLASSIC));

    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    const [edited, editedText] = await downloaded(page, () => menu(page, 'Download .txt'));
    const parsed = parseMazeText(editedText, edited);

    expect(edited).toBe('AAMC15Maze-edited.txt');
    expect(parsed.ok && mazesEqual(parsed.value.maze, toggleWall(maze, EDGE))).toBe(true);
  });
});

describe('Save to Mine', () => {
  test('keeps a link in Mine under its own name, and editing would too', async () => {
    const { maze } = await repoContent(CLASSIC);
    const code = encodeMazeCode(maze, { name: 'Shared one' });
    const page = await openMaze(`#/m/${code}`);
    await page.getByRole('button', { name: 'Save to Mine' }).click();
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));

    await expect.poll(() => page.locator('h1').textContent()).toBe('Shared one');
    expect(await mineCount(page)).toBe(1);
    expect(await page.getByRole('button', { name: 'Save to Mine' }).count()).toBe(0);
  });

  test('keeps a .txt in Mine with its notes', async () => {
    const page = await openPage(browser, contexts, app);
    const file = join(scratch('save-'), 'corridor.txt');
    writeFileSync(file, `${repoText(CLASSIC)}Notes\n`);
    await page.locator('input[data-open-file]').setInputFiles(file);
    await waitForMode(page, 'editor');
    await page.getByRole('button', { name: 'Save to Mine' }).click();
    await page.waitForFunction(() => window.location.hash.startsWith('#/mine/'));
    const item = await storedMine(page, mineId(page) ?? '');
    const decoded = item === undefined ? undefined : decodeMazeCode(item.code);

    expect(item?.name).toBe('corridor');
    expect(decoded?.ok === true ? decoded.value.trailer : undefined).toBe('Notes\n');
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
    const [name] = await downloaded(page, () => menu(page, 'Download .txt'));
    expect(name).toBe('Practice-run.txt');
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(maze));
  });

  test('Delete asks a second select, then deletes and opens the library on Mine', async () => {
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

describe('A local folder', () => {
  test('shows its mazes as the Folder source, skipping and counting what does not parse', async () => {
    const context = await folderContext();
    const page = await context.newPage();
    await page.goto(app);
    await fillFolder(page, {
      'a.txt': repoText(CLASSIC),
      'b.txt': repoText(CLASSIC),
      'bad.txt': 'no',
    });
    await page.getByRole('button', { name: 'Mine and files' }).click();
    await page.getByRole('menuitem', { name: 'Open folder…' }).click();

    await page.waitForFunction(() => window.location.hash === '#/?src=folder');
    await expect.poll(() => page.locator('a[data-artboard^="folder:"]').count()).toBe(2);
    await page.locator('[data-folder]').hover();
    await page.getByRole('tooltip').getByText('mazes, 1 file skipped').waitFor();
    const stored = await page.evaluate(
      (database) =>
        new Promise<string>((resolve) => {
          const request = indexedDB.open(database);
          request.addEventListener('success', () => {
            const get = request.result
              .transaction('settings')
              .objectStore('settings')
              .get('folder-handle');
            get.addEventListener('success', () => resolve(String(get.result?.kind)));
          });
        }),
      DATABASE_NAME
    );
    expect(stored).toBe('directory');
  });

  test('a folder maze edits into a copy, and Save to folder writes it back, asking in the click and before writing over a change on disk', async () => {
    const { maze } = await repoContent(CLASSIC);
    const context = await folderContext();
    const page = await context.newPage();
    await page.goto(app);
    await fillFolder(page, { 'a.txt': repoText(CLASSIC) });
    await page.getByRole('button', { name: 'Mine and files' }).click();
    await page.getByRole('menuitem', { name: 'Open folder…' }).click();
    await page.locator('a[data-artboard="folder:a.txt"]').click();
    await waitForMode(page, 'editor');

    expect(new URL(page.url()).hash).toBe('#/folder/a.txt');
    expect(await page.getByRole('button', { name: 'Save to folder' }).count()).toBe(0);
    await clickEdge(page, maze, EDGE);
    await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    const elsewhere = `${repoText(CLASSIC)}Written elsewhere\n`;
    await fillFolder(page, { 'a.txt': elsewhere });
    await page.getByRole('button', { name: 'Save to folder' }).click();
    await page.getByRole('dialog', { name: 'a.txt changed on disk' }).waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();

    expect(await folderText(page, 'a.txt')).toBe(elsewhere);
    expect(await page.evaluate(() => window.permissionAsks)).toEqual([]);
    await page.getByRole('button', { name: 'Save to folder' }).click();
    await page.getByRole('button', { name: 'Save anyway' }).click();
    await expectToast(page, 'Saved to a.txt');

    expect(await folderText(page, 'a.txt')).toBe(
      serializeMazeText({ maze: toggleWall(maze, EDGE), trailer: '' })
    );
    expect(await page.evaluate(() => window.permissionAsks)).toEqual([true]);
    expect(await mineCount(page)).toBe(1);
    await page.goto(`${app}#/folder/a.txt`);
    await waitForMode(page, 'editor');
    await expect.poll(() => page.locator('h1').textContent()).toBe('a');
  });

  test('a failed Save to folder says why and keeps the copy in Mine', async () => {
    const { maze } = await repoContent(CLASSIC);
    const context = await folderContext();
    const page = await context.newPage();
    await page.goto(app);
    await fillFolder(page, { 'a.txt': repoText(CLASSIC) });
    await page.getByRole('button', { name: 'Mine and files' }).click();
    await page.getByRole('menuitem', { name: 'Open folder…' }).click();
    await page.locator('a[data-artboard="folder:a.txt"]').click();
    await waitForMode(page, 'editor');
    await clickEdge(page, maze, EDGE);
    const saved = await expectSaved(page, sameMaze(toggleWall(maze, EDGE)));
    await page.evaluate(() => {
      Object.assign(FileSystemFileHandle.prototype, {
        createWritable: () =>
          Promise.reject(new DOMException('The disk is full', 'QuotaExceededError')),
      });
    });
    await page.getByRole('button', { name: 'Save to folder' }).click();

    await expectToast(page, /^Could not save to a\.txt \(.+\)$/);
    expect(await folderText(page, 'a.txt')).toBe(repoText(CLASSIC));
    expect((await storedMine(page, saved.id))?.code).toBe(saved.code);
  });

  test('#/folder/<file> opens again after a reload, and without access goes to the library', async () => {
    const context = await folderContext();
    const page = await context.newPage();
    await page.goto(app);
    await fillFolder(page, { 'a.txt': repoText(CLASSIC) });
    await page.getByRole('button', { name: 'Mine and files' }).click();
    await page.getByRole('menuitem', { name: 'Open folder…' }).click();
    await page.locator('a[data-artboard="folder:a.txt"]').click();
    await waitForMode(page, 'editor');
    await page.reload();
    await waitForMode(page, 'editor');

    expect(await page.locator('h1').textContent()).toBe('a');
    await page.evaluate(() => {
      window.refuseRead = true;
    });
    await page.addInitScript(() => {
      window.refuseRead = true;
    });
    await page.reload();

    await expectToast(page, 'No access to the folder. Open it again to allow.');
    await waitForMode(page, 'library');
  });

  test('is not kept where the storage is not persistent', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    await context.addInitScript(() => {
      Object.assign(navigator.storage, {
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(false),
      });
      Object.assign(window, {
        showDirectoryPicker: async () =>
          (await navigator.storage.getDirectory()).getDirectoryHandle('mazes', { create: true }),
      });
    });
    const page = await context.newPage();
    await page.goto(app);
    await fillFolder(page, { 'a.txt': repoText(CLASSIC) });
    await page.getByRole('button', { name: 'Mine and files' }).click();
    await page.getByRole('menuitem', { name: 'Open folder…' }).click();
    await expect.poll(() => page.locator('a[data-artboard^="folder:"]').count()).toBe(1);

    expect(await settingsKeys(page)).not.toContain('folder-handle');
  });

  test('is not offered where the browser cannot open a folder', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    await context.addInitScript(() => {
      Reflect.deleteProperty(window, 'showDirectoryPicker');
    });
    const page = await context.newPage();
    await page.goto(app);
    await page.locator('a[data-artboard]').first().waitFor();

    await page.getByRole('button', { name: 'Mine and files' }).click();
    await page.getByRole('menuitem', { name: 'Check for updates' }).waitFor();

    expect(await page.getByRole('menuitem', { name: 'Open folder…' }).count()).toBe(0);
  });
});
