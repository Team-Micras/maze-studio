/**
 * The backup of "Mine": every maze as a `.txt` file in one zip, with an index that keeps what a
 * `.txt` cannot (the name as typed, the profile, the dates and the origin), and the import that
 * reads such a zip back, or any `.txt` files and zips of them.
 *
 * @module
 */

import { parseMazeText, serializeMazeText, type Profile } from '@/maze';

import { uniqueStems } from './file-names';
import { mineContent, type MineDraft, type MineMaze, type MineOrigin } from './mine';
import { readZip, writeZip, type ZipEntry } from './zip';

/** The name of the index inside a backup zip. */
export const BACKUP_INDEX = 'maze-studio-backup.json';

const PROFILES: readonly Profile[] = ['classic', 'halfsize', 'training', 'free'];

/** What the index says about one file of a backup. */
interface IndexEntry {
  readonly file: string;
  readonly name: string;
  readonly profile: Profile;
  readonly createdAt: number;
  readonly origin?: MineOrigin;
}

/** A file given to the import, as picked or dropped. */
export interface ImportFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** A file the import left out, and why. */
export interface SkippedImport {
  readonly name: string;
  readonly message: string;
}

/** What an import read: drafts for Mine, and what it left out. */
export interface ImportReport {
  readonly drafts: readonly MineDraft[];
  readonly skipped: readonly SkippedImport[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIndexEntry(value: unknown): value is IndexEntry {
  return (
    isRecord(value) &&
    typeof value.file === 'string' &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'number' &&
    PROFILES.some((profile) => profile === value.profile) &&
    (value.origin === undefined ||
      (isRecord(value.origin) &&
        typeof value.origin.path === 'string' &&
        typeof value.origin.sha === 'string'))
  );
}

function readIndex(entries: readonly ZipEntry[]): Map<string, IndexEntry> {
  const index = entries.find((entry) => entry.name === BACKUP_INDEX);

  if (index === undefined) {
    return new Map();
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(index.bytes));
    return new Map(
      (Array.isArray(parsed) ? parsed : []).filter(isIndexEntry).map((entry) => [entry.file, entry])
    );
  } catch {
    return new Map();
  }
}

/**
 * A zip of every item, each as `<name>.txt` with a name that passes the repository's rule, and
 * the index.
 *
 * @param now The time the entries are stamped with.
 */
export function exportMine(items: readonly MineMaze[], now: Date = new Date()): Uint8Array {
  const readable = items.flatMap((item) => {
    const content = mineContent(item);
    return content.ok ? [{ item, text: serializeMazeText(content.value) }] : [];
  });
  const stems = uniqueStems(readable.map(({ item }) => item.name));
  const encoder = new TextEncoder();
  const files = readable.map(({ item, text }, index) => ({
    item,
    file: `${stems[index] ?? 'maze'}.txt`,
    bytes: encoder.encode(text),
  }));
  const index: IndexEntry[] = files.map(({ item, file }) => ({
    file,
    name: item.name,
    profile: item.profile,
    createdAt: item.createdAt,
    ...(item.origin === undefined ? {} : { origin: item.origin }),
  }));

  return writeZip(
    [
      ...files.map(({ file, bytes }) => ({ name: file, bytes })),
      { name: BACKUP_INDEX, bytes: encoder.encode(`${JSON.stringify(index, null, 2)}\n`) },
    ],
    now
  );
}

function baseName(path: string): string {
  return path.split('/').at(-1) ?? path;
}

function draftOf(file: ImportFile, indexed: IndexEntry | undefined): MineDraft | SkippedImport {
  const parsed = parseMazeText(new TextDecoder().decode(file.bytes), baseName(file.name));

  if (!parsed.ok) {
    return {
      name: file.name,
      message: `line ${parsed.error.line}, column ${parsed.error.column}: ${parsed.error.message}`,
    };
  }

  return {
    name: indexed?.name ?? baseName(file.name).replace(/\.txt$/i, ''),
    maze: parsed.value.maze,
    trailer: parsed.value.trailer,
    profile: indexed?.profile ?? 'free',
    ...(indexed?.origin === undefined ? {} : { origin: indexed.origin }),
    ...(indexed === undefined ? {} : { createdAt: indexed.createdAt }),
  };
}

async function expand(
  file: ImportFile
): Promise<{ files: ImportFile[]; index: Map<string, IndexEntry>; skipped: SkippedImport[] }> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return { files: [file], index: new Map(), skipped: [] };
  }

  const read = await readZip(file.bytes);

  if (!read.ok) {
    return { files: [], index: new Map(), skipped: [{ name: file.name, message: read.error }] };
  }

  return {
    files: read.value.filter((entry) => entry.name !== BACKUP_INDEX),
    index: readIndex(read.value),
    skipped: [],
  };
}

/**
 * Reads `.txt` files and zips of them, such as a backup, into drafts for Mine. Files that are not
 * `.txt`, or do not read as a maze, are left out with the reason.
 */
export async function readImport(files: readonly ImportFile[]): Promise<ImportReport> {
  const expanded = await Promise.all(files.map(expand));
  const drafts: MineDraft[] = [];
  const skipped: SkippedImport[] = expanded.flatMap((part) => part.skipped);

  for (const { files: inner, index } of expanded) {
    for (const file of inner) {
      const result = file.name.toLowerCase().endsWith('.txt')
        ? draftOf(file, index.get(file.name))
        : { name: file.name, message: 'not a .txt maze file' };

      if ('maze' in result) {
        drafts.push(result);
      } else {
        skipped.push(result);
      }
    }
  }

  return { drafts, skipped };
}
