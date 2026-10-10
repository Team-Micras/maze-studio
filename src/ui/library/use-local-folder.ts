import { useCallback, useEffect, useState } from 'react';

import {
  folderPermission,
  isFolderHandle,
  readFolder,
  readFolderFile,
  writeFolderFile,
  type FolderContents,
  type FolderHandle,
} from '@/library';
import { appStorage } from '@/ui/storage';

/** What a save to the folder came to: done, the file changed on disk since it was read, or why not. */
export type FolderSave =
  | { readonly ok: true }
  | { readonly ok: false; readonly changed: true }
  | { readonly ok: false; readonly changed?: false; readonly reason: string };

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
  /**
   * Writes `text` over `fileName`, asking for write permission inside the click, and rereads; a
   * file that changed on disk since it was read is left alone unless `overwrite` is set.
   */
  readonly save: (fileName: string, text: string, overwrite?: boolean) => Promise<FolderSave>;
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

/**
 * Whether the site's storage is kept, asking for it now if not: a folder handle is kept only then,
 * since reading one back where storage is not kept, as in a private window, crashes the page.
 */
async function persistent(): Promise<boolean> {
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The local folder (PLAN.md 3.4, DESIGN.md 6.1): picked by Open folder and kept in IndexedDB, so
 * a later visit finds it again; read at once when the browser still grants it, else left closed
 * until it is opened again. Writing a maze back asks for permission inside the click that does it,
 * and stops short when the file changed on disk since the app read it.
 */
export function useLocalFolder(): LocalFolder {
  const [handle, setHandle] = useState<FolderHandle | undefined>(undefined);
  const [contents, setContents] = useState<FolderContents | undefined>(undefined);
  const [restoring, setRestoring] = useState(true);
  const supported = picker() !== undefined;

  useEffect(() => {
    let current = true;

    void (async () => {
      try {
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
      } finally {
        if (current) {
          setRestoring(false);
        }
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

    if (await persistent()) {
      await (await appStorage())?.settings.saveFolder(picked);
    }
  }, []);

  const save = useCallback(
    async (fileName: string, text: string, overwrite = false): Promise<FolderSave> => {
      if (handle === undefined) {
        return { ok: false, reason: 'no folder open' };
      }

      const read = contents?.files.find((file) => file.fileName === fileName)?.raw;

      if (!overwrite && read !== (await readFolderFile(handle, fileName))) {
        return { ok: false, changed: true };
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
    [handle, contents]
  );

  return { supported, contents, restoring, open, save };
}
