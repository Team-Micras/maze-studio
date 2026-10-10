/**
 * A local folder of `.txt` mazes (PLAN.md 3.4, DESIGN.md 6.1), read through the File System
 * Access API: its files as the Folder source, those that do not parse skipped and counted, and a
 * maze written back to its file. Permission is asked only where the caller says, inside a click.
 *
 * @module
 */

import { parseMazeText, type MazeText } from '@/maze';

/** What a folder handle offers that the app uses; `FileSystemDirectoryHandle` in the browser. */
export interface FolderHandle {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<FolderEntryHandle>;
  getFileHandle(name: string): Promise<FolderFileHandle>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/** What a file handle of the folder offers. */
export interface FolderFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<{ text(): Promise<string>; readonly size: number }>;
  createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void> }>;
}

/** An entry of the folder: a file, or a folder inside it, which is not read. */
export type FolderEntryHandle =
  | FolderFileHandle
  | { readonly kind: 'directory'; readonly name: string };

/** A maze file of the folder, as read. */
export interface FolderFile {
  /** The file's name, `.txt` included, which its route names. */
  readonly fileName: string;
  readonly text: MazeText;
  /** The file's text as read, to tell later whether it changed on disk. */
  readonly raw: string;
}

/** Whether `value` is a folder handle, as a picker gives. */
export function isFolderHandle(value: unknown): value is FolderHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'directory' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'values' in value &&
    typeof value.values === 'function' &&
    'getFileHandle' in value &&
    typeof value.getFileHandle === 'function'
  );
}

/** What a folder holds: its name, the mazes that parse, and how many `.txt` files did not. */
export interface FolderContents {
  readonly name: string;
  readonly files: readonly FolderFile[];
  readonly skipped: number;
}

/** The largest file read, as for a `.txt` opened by itself. */
const MAX_FOLDER_FILE_BYTES = 1024 * 1024;

/** Whether the folder may be read, or written with `write`, asking for it when `ask` is set. */
export async function folderPermission(
  folder: FolderHandle,
  { write = false, ask = false }: { readonly write?: boolean; readonly ask?: boolean } = {}
): Promise<boolean> {
  const descriptor = { mode: write ? ('readwrite' as const) : ('read' as const) };
  const state = (await folder.queryPermission?.(descriptor)) ?? 'granted';

  if (state === 'granted' || !ask) {
    return state === 'granted';
  }

  return ((await folder.requestPermission?.(descriptor)) ?? 'denied') === 'granted';
}

/** A file's maze, or `undefined` when it is too large, cannot be read or does not parse. */
async function readFile(entry: FolderFileHandle): Promise<FolderFile | undefined> {
  try {
    const file = await entry.getFile();

    if (file.size > MAX_FOLDER_FILE_BYTES) {
      return undefined;
    }

    const raw = await file.text();
    const parsed = parseMazeText(raw, entry.name);
    return parsed.ok ? { fileName: entry.name, text: parsed.value, raw } : undefined;
  } catch {
    return undefined;
  }
}

/** The text of the file `fileName` of `folder` now, or `undefined` when it cannot be read. */
export async function readFolderFile(
  folder: FolderHandle,
  fileName: string
): Promise<string | undefined> {
  try {
    return await (await (await folder.getFileHandle(fileName)).getFile()).text();
  } catch {
    return undefined;
  }
}

/**
 * The `.txt` mazes of `folder`, by name; a file that is too large, cannot be read or does not
 * parse is skipped and counted.
 */
export async function readFolder(folder: FolderHandle): Promise<FolderContents> {
  const files: FolderFile[] = [];
  let skipped = 0;

  for await (const entry of folder.values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.txt')) {
      continue;
    }

    const read = await readFile(entry);

    if (read === undefined) {
      skipped += 1;
    } else {
      files.push(read);
    }
  }

  return {
    name: folder.name,
    files: files.toSorted((left, right) => left.fileName.localeCompare(right.fileName)),
    skipped,
  };
}

/** Writes `text` over the file `fileName` of `folder`. */
export async function writeFolderFile(
  folder: FolderHandle,
  fileName: string,
  text: string
): Promise<void> {
  const writable = await (await folder.getFileHandle(fileName)).createWritable();
  await writable.write(text);
  await writable.close();
}
