/**
 * Writing and reading the little-endian fields of the compact maze code.
 *
 * @module
 */

/** Appends unsigned integers, little-endian, and raw bytes to a growing buffer. */
export class ByteWriter {
  readonly #bytes: number[] = [];

  /** Appends one byte. */
  u8(value: number): this {
    this.#bytes.push(value & 0xff);
    return this;
  }

  /** Appends a 16-bit unsigned integer, low byte first. */
  u16(value: number): this {
    return this.u8(value).u8(value >> 8);
  }

  /** Appends bytes as they are. */
  bytes(values: Uint8Array): this {
    for (const value of values) {
      this.#bytes.push(value);
    }

    return this;
  }

  /** The bytes written so far. */
  toBytes(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }
}

/** Thrown by {@link ByteReader} when a read goes past the end of its buffer. */
export class ShortBufferError extends Error {
  constructor(needed: number, left: number) {
    super(`needed ${needed} more bytes, ${left} left`);
    this.name = 'ShortBufferError';
  }
}

/** Reads unsigned integers, little-endian, and raw bytes from the front of a buffer. */
export class ByteReader {
  readonly #bytes: Uint8Array;
  #offset = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  /** How many bytes are left to read. */
  get left(): number {
    return this.#bytes.length - this.#offset;
  }

  /** Reads one byte. */
  u8(): number {
    return this.bytes(1)[0] ?? 0;
  }

  /** Reads a 16-bit unsigned integer, low byte first. */
  u16(): number {
    const [low = 0, high = 0] = this.bytes(2);
    return low | (high << 8);
  }

  /**
   * Reads `count` bytes.
   *
   * @throws {ShortBufferError} When fewer are left.
   */
  bytes(count: number): Uint8Array {
    if (count > this.left) {
      throw new ShortBufferError(count, this.left);
    }

    this.#offset += count;
    return this.#bytes.subarray(this.#offset - count, this.#offset);
  }

  /** Reads every byte left. */
  rest(): Uint8Array {
    return this.bytes(this.left);
  }
}
