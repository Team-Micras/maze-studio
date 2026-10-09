/**
 * Zip archives built byte by byte, lies included, for the tests of the zip reader.
 *
 * @module
 */

/** One entry of a crafted archive. */
export interface CraftedEntry {
  readonly name: string;
  /** 0 for stored, 8 for deflated. */
  readonly method: number;
  /** The bytes as they sit in the archive. */
  readonly data: Uint8Array;
  /** The size it declares once taken out. */
  readonly size: number;
  readonly crc: number;
  /** The index of an earlier entry whose local header and data this one points at. */
  readonly sharesWith?: number;
}

function numbers(...fields: readonly (readonly [2 | 4, number])[]): Uint8Array {
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

  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }

  return all;
}

/** An archive of `entries`, written exactly as described. */
export function craftZip(entries: readonly CraftedEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  for (const entry of entries) {
    if (entry.sharesWith === undefined) {
      const name = encoder.encode(entry.name);
      const header = numbers(
        [4, 0x04034b50],
        [2, 20],
        [2, 0x0800],
        [2, entry.method],
        [2, 0],
        [2, 0],
        [4, entry.crc],
        [4, entry.data.length],
        [4, entry.size],
        [2, name.length],
        [2, 0]
      );
      offsets.push(length);
      locals.push(header, name, entry.data);
      length += header.length + name.length + entry.data.length;
    } else {
      offsets.push(offsets[entry.sharesWith] ?? 0);
    }
  }

  const central = entries.flatMap((entry, index) => {
    const name = encoder.encode(entry.name);
    return [
      numbers(
        [4, 0x02014b50],
        [2, 20],
        [2, 20],
        [2, 0x0800],
        [2, entry.method],
        [2, 0],
        [2, 0],
        [4, entry.crc],
        [4, entry.data.length],
        [4, entry.size],
        [2, name.length],
        [2, 0],
        [2, 0],
        [2, 0],
        [2, 0],
        [4, 0],
        [4, offsets[index] ?? 0]
      ),
      name,
    ];
  });
  const directory = concat(central);

  return concat([
    ...locals,
    directory,
    numbers(
      [4, 0x06054b50],
      [2, 0],
      [2, 0],
      [2, entries.length],
      [2, entries.length],
      [4, directory.length],
      [4, length],
      [2, 0]
    ),
  ]);
}
