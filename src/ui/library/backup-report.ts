/**
 * What the app says about Export all and Import (DESIGN.md 6.1 and 12): the zip's name, the toast
 * after an export, and the reports that list what was added, renamed and skipped.
 *
 * @module
 */

import type { SkippedExport, SkippedImport } from '@/library';

import type { Report } from './report-dialog';

/** A maze an import added to Mine: the name it got, and the one it came with when that was taken. */
export interface ImportedMaze {
  readonly name: string;
  readonly asked: string;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The name of the backup zip made at `now`, by the local date: `maze-studio-mine-2026-10-10.zip`. */
export function backupFileName(now: Date): string {
  const date = `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
  return `maze-studio-mine-${date}.zip`;
}

/** The toast after an export of `count` mazes: "Exported 3", or "Exported 3, skipped 1". */
export function exportNote(count: number, skipped: number): string {
  return skipped === 0 ? `Exported ${count}` : `Exported ${count}, skipped ${skipped}`;
}

/** The details of an export that left mazes out: each one and why. */
export function exportReport(skipped: readonly SkippedExport[]): Report {
  return {
    title: 'Skipped in the export',
    sections: [
      {
        title: 'Skipped',
        rows: skipped.map((item) => ({ id: item.id, name: item.name, detail: item.message })),
      },
    ],
  };
}

/**
 * The report of an import: the mazes added under their own name, those renamed because the name was
 * taken in Mine, and the files left out with the reason.
 */
export function importReport(
  added: readonly ImportedMaze[],
  skipped: readonly SkippedImport[]
): Report {
  return {
    title: 'Import',
    sections: [
      {
        title: 'Added',
        rows: added
          .filter((maze) => maze.name === maze.asked)
          .map((maze) => ({ id: maze.name, name: maze.name })),
      },
      {
        title: 'Renamed',
        rows: added
          .filter((maze) => maze.name !== maze.asked)
          .map((maze) => ({ id: maze.name, name: maze.name, detail: `${maze.asked} was taken` })),
      },
      {
        title: 'Skipped',
        rows: skipped.map((file, index) => ({
          id: String(index),
          name: file.name,
          detail: file.message,
        })),
      },
    ],
  };
}
