import { describe, expect, test } from 'vitest';

import { fromBase64Url, toBase64Url } from '@/maze/base64url';

describe('base64url without padding', () => {
  test('uses - and _ and drops the padding', () => {
    expect(toBase64Url(Uint8Array.from([0xfb, 0xff, 0xbf]))).toBe('-_-_');
    expect(toBase64Url(Uint8Array.from([1]))).toBe('AQ');
    expect(toBase64Url(Uint8Array.from([1, 2]))).toBe('AQI');
    expect(toBase64Url(new Uint8Array())).toBe('');
  });

  test('reads back every length and byte', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);

    for (let length = 0; length <= bytes.length; length += 1) {
      const slice = bytes.subarray(0, length);
      expect(fromBase64Url(toBase64Url(slice))).toEqual(slice);
    }
  });

  test('refuses padding, the plain base64 alphabet and impossible lengths', () => {
    expect(fromBase64Url('AQ==')).toBeUndefined();
    expect(fromBase64Url('+/+/')).toBeUndefined();
    expect(fromBase64Url('A')).toBeUndefined();
    expect(fromBase64Url('AQ I')).toBeUndefined();
  });
});
