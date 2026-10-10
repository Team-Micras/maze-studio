import { describe, expect, test } from 'vitest';

import { isTool, toolOfKey, TOOLS } from '@/ui/editor/tools';

describe('The tools', () => {
  test('are named only by their own names, not by what every object inherits', () => {
    expect(TOOLS.every((info) => isTool(info.tool))).toBe(true);
    expect(isTool('')).toBe(false);
    expect(isTool('constructor')).toBe(false);
    expect(isTool('toString')).toBe(false);
  });

  test('answer to their keys in either case', () => {
    expect(toolOfKey('g')).toBe('goal');
    expect(toolOfKey('C')).toBe('clear');
    expect(toolOfKey('b')).toBeUndefined();
  });
});
