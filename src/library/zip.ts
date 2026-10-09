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

/** The largest file the reader takes out of an archive, as declared or as inflated. */
export const MAX_ENTRY_BYTES = 1024 * 1024;

/** The most the reader takes out of one archive, all files together. */
export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

class TooLarge extends Error {}

async function drain(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  output: Uint8Array,
  length: number
): Promise<number> {
  const { done, value } = await reader.read();

  if (done) {
    return length;
  }

  if (length + value.length > output.length) {
    await reader.cancel();
    throw new TooLarge();
  }

  output.set(value, length);
  return drain(reader, output, length + value.length);
}

async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  const output = new Uint8Array(limit);
  return output.slice(0, await drain(reader, output, 0));
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
  /** The size of the file once taken out, as the archive declares it. */
  readonly size: number;
  readonly local: number;
  readonly data: Uint8Array;
  readonly dataStart: number;
}

function overlapping(located: readonly Located[]): Located | undefined {
  const ordered = located.toSorted((left, right) => left.local - right.local);
  return ordered.find((entry, index) => {
    const previous = ordered[index - 1];
    return previous !== undefined && entry.local < previous.dataStart + previous.data.length;
  });
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
  let total = 0;

  for (let index = 0; index < count; index++) {
    if (
      offset + CENTRAL_HEADER_SIZE > bytes.length ||
      view.getUint32(offset, true) !== CENTRAL_HEADER
    ) {
      return failure('the zip directory is damaged');
    }

    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + CENTRAL_HEADER_SIZE, offset + CENTRAL_HEADER_SIZE + nameLength)
    );
    total += size;

    if (size > MAX_ENTRY_BYTES) {
      return failure(`the zip entry ${name} is larger than a maze file can be`);
    }

    if (total > MAX_ARCHIVE_BYTES) {
      return failure('the zip archive holds more than a backup of mazes can');
    }

    if (local + LOCAL_HEADER_SIZE > bytes.length || view.getUint32(local, true) !== LOCAL_HEADER) {
      return failure(`the zip entry ${name} is damaged`);
    }

    const dataStart =
      local +
      LOCAL_HEADER_SIZE +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);

    if (dataStart + compressed > bytes.length) {
      return failure(`the zip entry ${name} is cut short`);
    }

    located.push({
      name,
      method,
      crc,
      size,
      local,
      dataStart,
      data: bytes.subarray(dataStart, dataStart + compressed),
    });
    offset += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }

  const shared = overlapping(located);
  return shared === undefined
    ? success(located)
    : failure(`the zip entry ${shared.name} overlaps another one`);
}

async function contents(entry: Located): Promise<Result<Uint8Array, string>> {
  if (entry.method === STORED) {
    return entry.data.length === entry.size
      ? success(entry.data.slice())
      : failure(`the zip entry ${entry.name} is not the size it declares`);
  }

  try {
    const bytes = await inflate(entry.data, entry.size);
    return bytes.length === entry.size
      ? success(bytes)
      : failure(`the zip entry ${entry.name} is not the size it declares`);
  } catch (error) {
    return failure(
      error instanceof TooLarge
        ? `the zip entry ${entry.name} is larger than it declares`
        : `the zip entry ${entry.name} does not inflate`
    );
  }
}

async function extract(entry: Located): Promise<Result<ZipEntry, string>> {
  if (entry.method !== STORED && entry.method !== DEFLATED) {
    return failure(`the zip entry ${entry.name} uses a compression this app does not read`);
  }

  const bytes = await contents(entry);

  if (!bytes.ok) {
    return bytes;
  }

  return crc32(bytes.value) === entry.crc
    ? success({ name: entry.name, bytes: bytes.value })
    : failure(`the zip entry ${entry.name} does not match its checksum`);
}

/**
 * The files of an archive, folders left out, one after the other. An entry larger than
 * {@link MAX_ENTRY_BYTES}, an archive larger than {@link MAX_ARCHIVE_BYTES}, an entry that
 * inflates past the size it declares and entries that share their data are refused, so a crafted
 * archive cannot fill the memory.
 *
 * @returns The files, or why the archive cannot be read.
 */
export async function readZip(bytes: Uint8Array): Promise<Result<ZipEntry[], string>> {
  const located = locate(bytes);

  if (!located.ok) {
    return located;
  }

  return located.value
    .filter((entry) => !entry.name.endsWith('/'))
    .reduce<Promise<Result<ZipEntry[], string>>>(
      async (previous, entry) => {
        const read = await previous;

        if (!read.ok) {
          return read;
        }

        const extracted = await extract(entry);
        return extracted.ok ? success([...read.value, extracted.value]) : extracted;
      },
      Promise.resolve(success([]))
    );
}
