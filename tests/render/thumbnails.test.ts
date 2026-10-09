import { describe, expect, test } from 'vitest';

import {
  LruCache,
  THUMBNAIL_BANDS,
  THUMBNAIL_CACHE_BYTES,
  thumbnailBand,
  thumbnailBytes,
  thumbnailSize,
} from '@/render';

const MEGABYTE = 1024 * 1024;

describe('thumbnailBand', () => {
  test('is the smallest band of 64, 128, 256 and 512 that covers the place', () => {
    expect(THUMBNAIL_BANDS).toEqual([64, 128, 256, 512]);
    expect([1, 64, 65, 128, 129, 200, 256, 257, 512].map(thumbnailBand)).toEqual([
      64, 64, 128, 128, 256, 256, 256, 512, 512,
    ]);
  });

  test('stays at 512 past it', () => {
    expect(thumbnailBand(513)).toBe(512);
    expect(thumbnailBand(4000)).toBe(512);
  });
});

describe('thumbnailSize and thumbnailBytes', () => {
  test('put the band on the longest side and count four bytes a pixel', () => {
    expect(thumbnailSize({ width: 32, height: 32 }, 256)).toEqual({ width: 256, height: 256 });

    const wide = thumbnailSize({ width: 10, height: 5 }, 128);
    expect(wide.width).toBe(128);
    expect(wide.height).toBeGreaterThan(60);
    expect(wide.height).toBeLessThan(68);
    expect(thumbnailBytes({ width: 512, height: 512 })).toBe(MEGABYTE);
  });
});

describe('The thumbnail cache', () => {
  test('holds 64 MB, sixty-four 512 px thumbnails', () => {
    const cache = new LruCache<string>(THUMBNAIL_CACHE_BYTES);
    const bytes = thumbnailBytes({ width: 512, height: 512 });

    for (let index = 0; index < 64; index++) {
      cache.set(`maze ${index}`, `bitmap ${index}`, bytes);
    }

    expect(cache.size).toBe(64);
    expect(cache.bytes).toBe(64 * MEGABYTE);
  });

  test('drops the least recently used once past 64 MB', () => {
    const cache = new LruCache<string>(THUMBNAIL_CACHE_BYTES);
    const bytes = thumbnailBytes({ width: 512, height: 512 });

    for (let index = 0; index < 64; index++) {
      cache.set(`maze ${index}`, `bitmap ${index}`, bytes);
    }

    expect(cache.get('maze 0')).toBe('bitmap 0');
    cache.set('maze 64', 'bitmap 64', bytes);

    expect(cache.has('maze 0')).toBe(true);
    expect(cache.has('maze 1')).toBe(false);
    expect(cache.has('maze 2')).toBe(true);
    expect(cache.bytes).toBe(64 * MEGABYTE);
  });

  test('drops as many small ones as a large one needs', () => {
    const cache = new LruCache<string>(THUMBNAIL_CACHE_BYTES);
    const small = thumbnailBytes({ width: 64, height: 64 });

    for (let index = 0; index < 4096; index++) {
      cache.set(`small ${index}`, 'bitmap', small);
    }

    cache.set('large', 'bitmap', thumbnailBytes({ width: 512, height: 512 }));

    expect(cache.bytes).toBeLessThanOrEqual(THUMBNAIL_CACHE_BYTES);
    expect(cache.has('small 63')).toBe(false);
    expect(cache.has('small 64')).toBe(true);
    expect(cache.has('large')).toBe(true);
  });

  test('replaces a key without counting it twice', () => {
    const cache = new LruCache<string>(100);
    cache.set('a', 'first', 60);
    cache.set('a', 'second', 30);

    expect(cache.get('a')).toBe('second');
    expect(cache.bytes).toBe(30);
  });

  test('keeps nothing larger than the whole capacity', () => {
    const cache = new LruCache<string>(100);
    cache.set('a', 'kept', 50);

    expect(cache.set('huge', 'refused', 101)).toBe(false);
    expect(cache.has('huge')).toBe(false);
    expect(cache.get('a')).toBe('kept');
  });
});
