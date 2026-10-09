/**
 * The open board of the built studio, for the editor's e2e tests: where a point of the maze is on
 * the page, what autosave has written to Mine, and the repository file a maze came from.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from 'playwright';
import { expect } from 'vitest';

import { loadSnapshot, type MineMaze } from '@/library';
import { DATABASE_NAME } from '@/library/database';
import { decodeMazeCode, type Edge, type Maze } from '@/maze';
import { boardGeometry, type MazePoint } from '@/render';

const MAZEFILES = join(import.meta.dirname, '..', '..', '..', 'vendor', 'mazefiles');

/** A point on the page, in CSS pixels. */
export interface PagePoint {
  readonly x: number;
  readonly y: number;
}

/** A maze and the text after its grid. */
export interface MazeContent {
  readonly maze: Maze;
  readonly trailer: string;
}

/** Where the maze point `point` of `maze`, the maze on the open board, is on the page. */
export async function pagePoint(page: Page, maze: Maze, point: MazePoint): Promise<PagePoint> {
  const box = await page.locator('[data-open-board] svg[data-board]').boundingBox();

  if (box === null) {
    throw new Error('no open board');
  }

  const geometry = boardGeometry(maze);
  const scale = Math.min(box.width / geometry.width, box.height / geometry.height);
  const left = box.x + (box.width - geometry.width * scale) / 2;
  const top = box.y + (box.height - geometry.height * scale) / 2;
  return {
    x: left + (geometry.margin + point.u * geometry.pitch) * scale,
    y: top + (geometry.margin + (geometry.rows - point.v) * geometry.pitch) * scale,
  };
}

/** The middle of a wall slot, in cells. */
export function edgeMiddle(edge: Edge): MazePoint {
  return edge.direction === 'horizontal'
    ? { u: edge.x + 0.5, v: edge.y }
    : { u: edge.x, v: edge.y + 0.5 };
}

/** The id of the item of Mine the page shows, from its route. */
export function mineId(page: Page): string | undefined {
  const match = /^#\/mine\/(.+)$/.exec(new URL(page.url()).hash);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

function isMineMaze(value: unknown): value is MineMaze {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'code' in value &&
    typeof value.code === 'string' &&
    'version' in value &&
    typeof value.version === 'number'
  );
}

/** The item of Mine with `id`, as stored. */
export async function storedMine(page: Page, id: string): Promise<MineMaze | undefined> {
  const stored: unknown = await page.evaluate(
    ([database, key]) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open(database);
        request.addEventListener('error', () => reject(request.error ?? new Error('no database')));
        request.addEventListener('success', () => {
          const db = request.result;
          const get = db.transaction('mine').objectStore('mine').get(key);
          get.addEventListener('error', () => reject(get.error ?? new Error('no item')));
          get.addEventListener('success', () => {
            db.close();
            resolve(get.result);
          });
        });
      }),
    [DATABASE_NAME, id] as const
  );
  return isMineMaze(stored) ? stored : undefined;
}

/** What an item of Mine holds. */
export function contentOf(item: MineMaze): MazeContent {
  const decoded = decodeMazeCode(item.code);

  if (!decoded.ok) {
    throw new Error(decoded.error.message);
  }

  return { maze: decoded.value.maze, trailer: decoded.value.trailer };
}

/** Expects autosave to write a maze that `matches` to the item the page shows, and returns it. */
export async function expectSaved(
  page: Page,
  matches: (content: MazeContent) => boolean
): Promise<MineMaze> {
  let found: MineMaze | undefined;
  await expect
    .poll(async () => {
      const id = mineId(page);
      found = id === undefined ? undefined : await storedMine(page, id);
      return found !== undefined && matches(contentOf(found));
    })
    .toBe(true);

  if (found === undefined) {
    throw new Error('nothing saved');
  }

  return found;
}

/** The maze of a repository file as the app's snapshot has it. */
export async function repoContent(path: string): Promise<MazeContent> {
  const snapshot = await loadSnapshot();
  const file = snapshot.files.find((candidate) => candidate.path === path);
  const decoded = file === undefined ? undefined : decodeMazeCode(file.code);

  if (decoded?.ok !== true) {
    throw new Error(`no maze at ${path}`);
  }

  return { maze: decoded.value.maze, trailer: decoded.value.trailer };
}

/** The bytes of a repository file, as text. */
export function repoText(path: string): string {
  return readFileSync(join(MAZEFILES, path), 'utf8');
}
