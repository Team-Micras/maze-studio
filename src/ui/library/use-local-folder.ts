import { useCallback, useEffect, useState } from 'react';

import {
  folderPermission,
  isFolderHandle,
  readFolder,
  writeFolderFile,
  type FolderContents,
  type FolderHandle,
} from '@/library';
import { appStorage } from '@/ui/storage';

/** What a save to the folder came to: done, or why not. */
export type FolderSave = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** The local folder of the Folder source (DESIGN.md 6.1). */
export interface LocalFolder {
  /** Whether the browser can open a folder at all: Chrome and Edge. */
  readonly supported: boolean;
  /** The folder's mazes, while it is open and readable. */
  readonly contents: FolderContents | undefined;
  /** Whether the folder kept from a visit before is still being looked at. */
  readonly restoring: boolean;
  /** Asks for a folder with the picker; called inside a click. */
  readonly open: () => Promise<void>;
  /** Writes `text` over `fileName`, asking for write permission inside the click, and rereads. */
  readonly save: (fileName: string, text: string) => Promise<FolderSave>;
}

/** The picker the browser offers, or a test puts in its place. */
function picker(): (() => Promise<FolderHandle>) | undefined {
  const pick: unknown = Reflect.get(window, 'showDirectoryPicker');

  if (typeof pick !== 'function') {
    return undefined;
  }

  return async () => {
    const picked: unknown = await Reflect.apply(pick, window, [{ mode: 'readwrite' }]);

    if (!isFolderHandle(picked)) {
      throw new TypeError('the picker gave no folder');
    }

    return picked;
  };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The local folder (PLAN.md 3.4, DESIGN.md 6.1): picked by Open folder and kept in IndexedDB, so
 * a later visit finds it again; read at once when the browser still grants it, else left closed
 * until it is opened again. Writing a maze back asks for permission inside the click that does it.
 */
export function useLocalFolder(): LocalFolder {
  const [handle, setHandle] = useState<FolderHandle | undefined>(undefined);
  const [contents, setContents] = useState<FolderContents | undefined>(undefined);
  const [restoring, setRestoring] = useState(true);
  const supported = picker() !== undefined;

  useEffect(() => {
    let current = true;

    void (async () => {
      const kept = await (await appStorage())?.settings.folder();

      if (kept !== undefined && current) {
        setHandle(kept);

        if (await folderPermission(kept)) {
          const read = await readFolder(kept);

          if (current) {
            setContents(read);
          }
        }
      }

      if (current) {
        setRestoring(false);
      }
    })();

    return () => {
      current = false;
    };
  }, []);

  const open = useCallback(async () => {
    const pick = picker();

    if (pick === undefined) {
      return;
    }

    const picked = await pick();
    setHandle(picked);
    setContents(await readFolder(picked));
    await (await appStorage())?.settings.saveFolder(picked);
  }, []);

  const save = useCallback(
    async (fileName: string, text: string): Promise<FolderSave> => {
      if (handle === undefined) {
        return { ok: false, reason: 'no folder open' };
      }

      try {
        if (!(await folderPermission(handle, { write: true, ask: true }))) {
          return { ok: false, reason: 'no permission' };
        }

        await writeFolderFile(handle, fileName, text);
        setContents(await readFolder(handle));
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: reasonOf(error) };
      }
    },
    [handle]
  );

  return { supported, contents, restoring, open, save };
}
