/**
 * Sharing the maze on screen (PLAN.md 3.4, DESIGN.md 6.1 and 12): its link, which carries the walls,
 * the marks and the name but not the text after the grid; its `.txt`; and copying text with the
 * clipboard, or without it on a page served over plain HTTP.
 *
 * @module
 */

import { uniqueStems } from '@/library';
import { encodeMazeCode, serializeMazeText } from '@/maze';
import type { OpenMaze } from '@/ui/open-maze';
import { routeHash } from '@/ui/routes';

/** The link that opens `open`, on the page at `href`. */
export function mazeLink(open: OpenMaze, href: string): string {
  const url = new URL(href);
  url.hash = routeHash({ kind: 'link', code: encodeMazeCode(open.maze, { name: open.name }) });
  return url.href;
}

/** Whether the link leaves out text after the grid that the maze has. */
export function linkDropsNotes(open: OpenMaze): boolean {
  return open.document.trailer !== '';
}

/** The name a download of `open` takes: a stem that passes the repository's name rule, `.txt`. */
export function downloadName(open: OpenMaze): string {
  return `${uniqueStems([open.name])[0] ?? 'maze'}.txt`;
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

/** How long the download's object URL lives: revoked at once, the browser may not have read it. */
const REVOKE_AFTER_MS = 10_000;

/** Downloads `text` as `fileName`. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
