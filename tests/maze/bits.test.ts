import { describe, expect, test } from 'vitest';

import { Bits } from '@/maze';

describe('Bits', () => {
  test('starts clear and reads back the bits it was made from', () => {
    const bits = Bits.from(19, (index) => index % 3 === 0);
    expect(bits.length).toBe(19);
    expect(Array.from({ length: 19 }, (_, index) => bits.get(index))).toEqual(
      Array.from({ length: 19 }, (_, index) => index % 3 === 0)
    );
    expect(Bits.from(9).get(8)).toBe(false);
  });

  test('changes a copy and leaves the original as it was', () => {
    const before = Bits.from(10);
    const after = before.with(9, true);
    expect(after.get(9)).toBe(true);
    expect(before.get(9)).toBe(false);
    expect(after.with(9, true)).toBe(after);
    expect(after.with(9, false).equals(before)).toBe(true);
  });

  test('compares by length and content', () => {
    expect(Bits.from(8).equals(Bits.from(9))).toBe(false);
    expect(Bits.from(8).equals(Bits.from(8).with(3, true))).toBe(false);
    expect(Bits.from(0).equals(Bits.from(0))).toBe(true);
  });

  test('refuses an index or a length out of range', () => {
    expect(() => Bits.from(4).get(4)).toThrow(RangeError);
    expect(() => Bits.from(4).get(-1)).toThrow(RangeError);
    expect(() => Bits.from(4).with(1.5, true)).toThrow(RangeError);
    expect(() => Bits.from(-1)).toThrow(RangeError);
  });
});
