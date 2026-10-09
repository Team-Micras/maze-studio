import { describe, expect, test } from 'vitest';

import { uniqueName } from '@/library';

describe('A unique name in Mine', () => {
  test('is the name itself while nothing has it', () => {
    expect(uniqueName('AAMC15Maze (edited)', ['japan2011hef (edited)'])).toBe(
      'AAMC15Maze (edited)'
    );
  });

  test('counts on from 2 past the names taken', () => {
    expect(uniqueName('Untitled maze', ['Untitled maze'])).toBe('Untitled maze 2');
    expect(uniqueName('Untitled maze', ['Untitled maze', 'Untitled maze 2'])).toBe(
      'Untitled maze 3'
    );
  });

  test('compares without case', () => {
    expect(uniqueName('Untitled maze', ['untitled MAZE'])).toBe('Untitled maze 2');
    expect(uniqueName('Untitled maze', ['UNTITLED MAZE', 'untitled maze 2'])).toBe(
      'Untitled maze 3'
    );
  });
});
