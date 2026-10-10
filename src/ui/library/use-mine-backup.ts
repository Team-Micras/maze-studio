import { useState } from 'react';

import { exportMine, oversizedImport, readImport, uniqueName, type SkippedImport } from '@/library';
import { downloadBlob } from '@/ui/download';
import { appStorage } from '@/ui/storage';
import { showToast } from '@/ui/toasts';

import {
  backupFileName,
  exportNote,
  exportReport,
  importReport,
  type ImportedMaze,
} from './backup-report';
import type { Report } from './report-dialog';
import { reloadLibrary } from './use-library';

/** What {@link useMineBackup} gives the app. */
export interface MineBackup {
  /** The report on screen, if any. */
  readonly report: Report | undefined;
  readonly closeReport: () => void;
  /** Downloads Mine as a zip and says how many mazes went in. */
  readonly exportAll: () => Promise<void>;
  /** Adds the mazes of `files` to Mine and shows the report; resolves to how many were added. */
  readonly importFiles: (files: readonly File[]) => Promise<number>;
}

const NO_STORAGE = 'Mine is not available in this browser. Use Download .txt instead';

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Export all and Import of the "Mine and files" menu (DESIGN.md 6.1): the zip of `exportMine`, with
 * a Details action when it left mazes out, and the drafts of `readImport` stored under names unique
 * in Mine, with the report of what was added, renamed and skipped.
 */
export function useMineBackup(): MineBackup {
  const [report, setReport] = useState<Report | undefined>(undefined);

  const exportAll = async (): Promise<void> => {
    const storage = await appStorage();

    if (storage === undefined) {
      showToast(NO_STORAGE);
      return;
    }

    const items = await storage.mine.list();
    const now = new Date();
    const { zip, skipped } = exportMine(items, now);
    downloadBlob(backupFileName(now), new Blob([zip.slice()], { type: 'application/zip' }));
    const note = exportNote(items.length - skipped.length, skipped.length);

    if (skipped.length === 0) {
      showToast(note);
    } else {
      showToast(note, {
        action: {
          label: 'Details',
          altText: 'Show the skipped mazes',
          run: () => setReport(exportReport(skipped)),
        },
      });
    }
  };

  const importFiles = async (files: readonly File[]): Promise<number> => {
    const storage = await appStorage();

    if (storage === undefined) {
      showToast(NO_STORAGE);
      return 0;
    }

    const refused: SkippedImport[] = files.flatMap((file) => {
      const reason = oversizedImport(file.name, file.size);
      return reason === undefined ? [] : [{ name: file.name, message: reason }];
    });
    const accepted = files.filter((file) => oversizedImport(file.name, file.size) === undefined);
    const read = await readImport(
      await Promise.all(
        accepted.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }))
      )
    );
    const taken = (await storage.mine.list()).map((item) => item.name);
    const named = read.drafts.map((draft) => {
      const name = uniqueName(draft.name, taken);
      taken.push(name);
      return { draft, name };
    });
    const outcomes = await Promise.all(
      named.map(async ({ draft, name }): Promise<ImportedMaze | SkippedImport> => {
        try {
          await storage.mine.create({ ...draft, name });
          return { name, asked: draft.name };
        } catch (error) {
          return { name: draft.name, message: reasonOf(error) };
        }
      })
    );
    const added = outcomes.filter((outcome): outcome is ImportedMaze => 'asked' in outcome);
    const failed = outcomes.filter((outcome): outcome is SkippedImport => 'message' in outcome);

    reloadLibrary();
    setReport(importReport(added, [...refused, ...read.skipped, ...failed]));
    return added.length;
  };

  return { report, closeReport: () => setReport(undefined), exportAll, importFiles };
}
