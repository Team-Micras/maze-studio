import { describe, expect, test } from 'vitest';

import { TEXT } from '@/generator/features';

describe('route sentences', () => {
  test('name the routes by robot, not by colour', () => {
    expect(
      TEXT.twoRoutes({ cells: 54, turns: 12 }, { cells: 60, turns: 8, best: 'a 5-move diagonal' })
    ).toBe(
      'Two routes: without diagonals 54 cells with 12 turns, with diagonals 60 cells with a 5-move diagonal'
    );
    expect(TEXT.tradeOff(8, 3)).toBe(
      'With diagonals, the diagonal route is 8 % faster; without diagonals it is 3 % slower'
    );
  });
});
