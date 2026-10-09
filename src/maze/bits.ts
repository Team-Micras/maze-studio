/**
 * A fixed-length immutable set of bits, the storage of a maze's walls.
 *
 * @module
 */

/** A fixed-length sequence of bits that never changes; `with` returns a changed copy. */
export class Bits {
  readonly #bytes: Uint8Array;

  /** How many bits there are. */
  readonly length: number;

  private constructor(length: number, bytes: Uint8Array) {
    this.length = length;
    this.#bytes = bytes;
  }

  /**
   * Bits whose value at each index is given by `bit`.
   *
   * @param length How many bits, a non-negative integer.
   * @param bit The value of the bit at an index; all clear when omitted.
   */
  static from(length: number, bit: (index: number) => boolean = () => false): Bits {
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(`a bit set has a non-negative integer length, not ${length}`);
    }

    const bytes = new Uint8Array(Math.ceil(length / 8));

    for (let index = 0; index < length; index++) {
      if (bit(index)) {
        bytes[index >> 3] |= 1 << (index & 7);
      }
    }

    return new Bits(length, bytes);
  }

  /** The bit at `index`. */
  get(index: number): boolean {
    this.#check(index);
    return ((this.#bytes[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
  }

  /** A copy with the bit at `index` set to `value`, or these bits when it already is. */
  with(index: number, value: boolean): Bits {
    if (this.get(index) === value) {
      return this;
    }

    const bytes = this.#bytes.slice();
    bytes[index >> 3] ^= 1 << (index & 7);
    return new Bits(this.length, bytes);
  }

  /**
   * A copy with every bit at `indices` set to `value`, or these bits when they all already are.
   * Repeated indices are fine.
   */
  withAll(indices: Iterable<number>, value: boolean): Bits {
    let bytes: Uint8Array | undefined;

    for (const index of indices) {
      if (this.get(index) !== value || bytes !== undefined) {
        bytes ??= this.#bytes.slice();
        bytes[index >> 3] = value
          ? (bytes[index >> 3] ?? 0) | (1 << (index & 7))
          : (bytes[index >> 3] ?? 0) & ~(1 << (index & 7));
      }
    }

    return bytes === undefined ? this : new Bits(this.length, bytes);
  }

  /** Whether `other` has the same length and the same bits. */
  equals(other: Bits): boolean {
    return (
      this.length === other.length &&
      this.#bytes.every((byte, index) => byte === other.#bytes[index])
    );
  }

  #check(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`bit ${index} is outside a set of ${this.length}`);
    }
  }
}
