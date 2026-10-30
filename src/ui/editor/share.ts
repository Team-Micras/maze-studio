/**
 * Sharing the maze on screen (PLAN.md 3.4, DESIGN.md 6.1 and 12): its link, which carries the walls,
 * the marks and the name but not the text after the grid; its `.txt`, its SVG and Markdown that
 * shows the SVG; and copying text with the clipboard, or without it on a page served over plain
 * HTTP.
 *
 * @module
 */

import { uniqueStems } from '@/library';
import { refOf, type MazeRef } from '@/library/maze-key';
import { encodeMazeCode, serializeMazeText } from '@/maze';
import { downloadBlob } from '@/ui/download';
import type { OpenMaze } from '@/ui/open-maze';
import { routeHash } from '@/ui/routes';

function linkTo(ref: MazeRef, href: string): string {
  const url = new URL(href);
  url.hash = routeHash(ref);
  return url.href;
}

/** The link that opens `open`, on the page at `href`. */
export function mazeLink(open: OpenMaze, href: string): string {
  return linkTo({ kind: 'link', code: encodeMazeCode(open.maze, { name: open.name }) }, href);
}

/**
 * Markdown for a README or a pull request: the image Download SVG saves, under the name it saves it
 * as, linked to the maze on the page at `href`: by its repository route for a maze of the
 * repository still as its file has it, and by the link Copy link copies for any other, an edited
 * repository maze included while its copy in My mazes is not written yet.
 */
export function mazeMarkdown(open: OpenMaze, href: string): string {
  const ref = refOf(open.key);
  const link =
    ref?.kind === 'repo' && open.document.source !== undefined
      ? linkTo(ref, href)
      : mazeLink(open, href);
  const alt = open.name.replaceAll(/[[\]\\]/g, (character) => `\\${character}`);
  return `[![${alt}](${downloadName(open, '.svg')})](<${link}>)`;
}

/** Whether the link leaves out text after the grid that the maze has. */
export function linkDropsNotes(open: OpenMaze): boolean {
  return open.document.trailer !== '';
}

/** The name a download of `open` takes: a stem that passes the repository's name rule, `extension`. */
export function downloadName(open: OpenMaze, extension: '.txt' | '.svg' = '.txt'): string {
  return `${uniqueStems([open.name])[0] ?? 'maze'}${extension}`;
}

/** The text of `open` as a mazefiles `.txt`, with its text after the grid. */
export function mazeFileText(open: OpenMaze): string {
  return serializeMazeText({ maze: open.maze, trailer: open.document.trailer });
}

/** Copies `text`, through the clipboard or, where it is missing, a selected text area. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  }
}

/** Downloads `text` as `fileName`, of the media `type`. */
export function downloadText(fileName: string, text: string, type = 'text/plain'): void {
  downloadBlob(fileName, new Blob([text], { type }));
}
