import { describe, expect, test } from 'vitest';

import type { CatalogEntry } from '@/library';
import { listOrder, steppedKey } from '@/ui/studio/list-order';

function entry(key: string, origin: 'repo' | 'mine'): CatalogEntry {
  return { key, origin, name: key, category: 'classic', width: 16, height: 16 };
}

describe('listOrder', () => {
  test('puts Mine first and keeps each origin in catalog order', () => {
    const entries = [
      entry('r1', 'repo'),
      entry('m1', 'mine'),
      entry('r2', 'repo'),
      entry('m2', 'mine'),
    ];

    expect(listOrder(entries).map((item) => item.key)).toEqual(['m1', 'm2', 'r1', 'r2']);
  });
});

describe('steppedKey', () => {
  const keys = ['a', 'b', 'c'];

  test('steps forward and back, wrapping at both ends', () => {
    expect(steppedKey(keys, 'a', 1)).toBe('b');
    expect(steppedKey(keys, 'c', 1)).toBe('a');
    expect(steppedKey(keys, 'a', -1)).toBe('c');
    expect(steppedKey(keys, 'b', -4)).toBe('a');
  });

  test('starts at the first key when the current one is not listed, and has none in an empty list', () => {
    expect(steppedKey(keys, 'z', 1)).toBe('a');
    expect(steppedKey(keys, undefined, -1)).toBe('a');
    expect(steppedKey([], 'a', 1)).toBeUndefined();
  });
});
