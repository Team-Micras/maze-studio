/**
 * A least-recently-used cache bounded by bytes rather than by entries, for bitmaps whose sizes
 * differ by a factor of 64.
 *
 * @module
 */

interface Entry<Value> {
  readonly value: Value;
  readonly bytes: number;
}

/** Values by key, dropping the least recently used once their bytes pass the capacity. */
export class LruCache<Value> {
  readonly #entries = new Map<string, Entry<Value>>();
  #bytes = 0;

  /** The most bytes the values may add up to. */
  readonly capacity: number;

  /** @param capacity The most bytes the values may add up to. */
  constructor(capacity: number) {
    this.capacity = capacity;
  }

  /** The bytes the values held add up to. */
  get bytes(): number {
    return this.#bytes;
  }

  /** How many values are held. */
  get size(): number {
    return this.#entries.size;
  }

  /** Whether a value is held under `key`, without making it recently used. */
  has(key: string): boolean {
    return this.#entries.has(key);
  }

  /** The value under `key`, which becomes the most recently used, or `undefined`. */
  get(key: string): Value | undefined {
    const entry = this.#entries.get(key);

    if (entry === undefined) {
      return undefined;
    }

    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  /**
   * Keeps `value` under `key` as the most recently used, then drops the least recently used
   * values until the bytes fit. A value larger than the whole capacity is not kept.
   *
   * @returns Whether the value was kept.
   */
  set(key: string, value: Value, bytes: number): boolean {
    this.delete(key);

    if (bytes > this.capacity) {
      return false;
    }

    this.#entries.set(key, { value, bytes });
    this.#bytes += bytes;

    for (const [oldest, entry] of this.#entries) {
      if (this.#bytes <= this.capacity) {
        break;
      }

      this.#entries.delete(oldest);
      this.#bytes -= entry.bytes;
    }

    return true;
  }

  /** Drops the value under `key`, if any. */
  delete(key: string): void {
    const entry = this.#entries.get(key);

    if (entry !== undefined) {
      this.#entries.delete(key);
      this.#bytes -= entry.bytes;
    }
  }
}
