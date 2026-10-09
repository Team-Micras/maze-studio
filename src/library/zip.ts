/**
 * A minimal zip writer and reader for the backup of "Mine": the writer stores files without
 * compression, which costs little for maze text and needs no dependency; the reader also takes
 * deflated entries, through the platform's `DecompressionStream`, so a zip made by another tool
 * imports too. Names are UTF-8. No ZIP64, no encryption, no multi-disk archives.
 *
 * @module
 */

import { failure, success, type Result } from '@/maze';

/** One file of an archive. */
export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const VERSION = 20;
const UTF8_NAMES = 0x0800;
const STORED = 0;
const DEFLATED = 8;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_SIZE = 22;
const MAX_COMMENT = 0xffff;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

/** The CRC-32 of `bytes`, as zip uses it. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day:
      ((Math.max(date.getFullYear(), 1980) - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

class Writer {
  readonly #parts: Uint8Array[] = [];
  length = 0;

  numbers(...fields: readonly (readonly [size: 2 | 4, value: number])[]): void {
    const bytes = new Uint8Array(fields.reduce((sum, [size]) => sum + size, 0));
    const view = new DataView(bytes.buffer);
    let offset = 0;

    for (const [size, value] of fields) {
      if (size === 2) {
        view.setUint16(offset, value, true);
      } else {
        view.setUint32(offset, value, true);
      }

      offset += size;
    }

    this.bytes(bytes);
  }

  bytes(bytes: Uint8Array): void {
    this.#parts.push(bytes);
    this.length += bytes.length;
  }

  toBytes(): Uint8Array {
    const all = new Uint8Array(this.length);
    let offset = 0;

    for (const part of this.#parts) {
      all.set(part, offset);
      offset += part.length;
    }

    return all;
  }
}

/**
 * An archive of `entries`, stored without compression.
 *
 * @param modified The time every entry is stamped with.
 */
export function writeZip(entries: readonly ZipEntry[], modified: Date = new Date()): Uint8Array {
  const { time, day } = dosTime(modified);
  const archive = new Writer();
  const directory = new Writer();
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const offset = archive.length;
    const shared = [
      [2, VERSION],
      [2, UTF8_NAMES],
      [2, STORED],
      [2, time],
      [2, day],
      [4, crc],
      [4, entry.bytes.length],
      [4, entry.bytes.length],
      [2, name.length],
      [2, 0],
    ] as const;

    archive.numbers([4, LOCAL_HEADER], ...shared);
    archive.bytes(name);
    archive.bytes(entry.bytes);
    directory.numbers(
      [4, CENTRAL_HEADER],
      [2, VERSION],
      ...shared,
      [2, 0],
      [2, 0],
      [2, 0],
      [4, 0],
      [4, offset]
    );
    directory.bytes(name);
  }

  const directoryOffset = archive.length;
  archive.bytes(directory.toBytes());
  archive.numbers(
    [4, END_OF_CENTRAL_DIRECTORY],
    [2, 0],
    [2, 0],
    [2, entries.length],
    [2, entries.length],
    [4, directory.length],
    [4, directoryOffset],
    [2, 0]
  );
  return archive.toBytes();
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function endOfDirectory(view: DataView): number | undefined {
  const last = view.byteLength - END_SIZE;

  for (let offset = last; offset >= Math.max(0, last - MAX_COMMENT); offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }

  return undefined;
}

interface Located {
  readonly name: string;
  readonly method: number;
  readonly crc: number;
  readonly data: Uint8Array;
}

function locate(bytes: Uint8Array): Result<Located[], string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length >= END_SIZE ? endOfDirectory(view) : undefined;

  if (end === undefined) {
    return failure('not a zip archive');
  }

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const located: Located[] = [];
  const decoder = new TextDecoder();

  for (let index = 0; index < count; index++) {
    if (
      offset + CENTRAL_HEADER_SIZE > bytes.length ||
      view.getUint32(offset, true) !== CENTRAL_HEADER
    ) {
      return failure('the zip directory is damaged');
    }

    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + CENTRAL_HEADER_SIZE, offset + CENTRAL_HEADER_SIZE + nameLength)
    );

    if (local + LOCAL_HEADER_SIZE > bytes.length || view.getUint32(local, true) !== LOCAL_HEADER) {
      return failure(`the zip entry ${name} is damaged`);
    }

    const start =
      local +
      LOCAL_HEADER_SIZE +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);

    if (start + size > bytes.length) {
      return failure(`the zip entry ${name} is cut short`);
    }

    located.push({ name, method, crc, data: bytes.subarray(start, start + size) });
    offset += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }

  return success(located);
}

async function extract(entry: Located): Promise<Result<ZipEntry, string>> {
  if (entry.method !== STORED && entry.method !== DEFLATED) {
    return failure(`the zip entry ${entry.name} uses a compression this app does not read`);
  }

  let bytes: Uint8Array;

  try {
    bytes = entry.method === STORED ? entry.data.slice() : await inflate(entry.data);
  } catch {
    return failure(`the zip entry ${entry.name} does not inflate`);
  }

  return crc32(bytes) === entry.crc
    ? success({ name: entry.name, bytes })
    : failure(`the zip entry ${entry.name} does not match its checksum`);
}

/**
 * The files of an archive, folders left out.
 *
 * @returns The files, or why the archive cannot be read.
 */
export async function readZip(bytes: Uint8Array): Promise<Result<ZipEntry[], string>> {
  const located = locate(bytes);

  if (!located.ok) {
    return located;
  }

  const extracted = await Promise.all(
    located.value.filter((entry) => !entry.name.endsWith('/')).map(extract)
  );
  const broken = extracted.find((entry) => !entry.ok);

  if (broken !== undefined && !broken.ok) {
    return broken;
  }

  return success(extracted.flatMap((entry) => (entry.ok ? [entry.value] : [])));
}
