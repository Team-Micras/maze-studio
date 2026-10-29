import { describe, expect, test } from 'vitest';

import { generate, PRESETS, withMaze } from '@/generator';
import { borderedMaze, presetMaze, toggleWall } from '@/maze';
import { WAITING } from '@/render/loading';
import type { Item } from '@/ui/generator/batch-run';
import {
  generatesFor,
  isBlank,
  phaseText,
  pickHint,
  replacesBoard,
  stepTo,
  swipeStep,
  unsupportedBoard,
  type ReadyItem,
} from '@/ui/generator/candidates';

const [RECOMMENDED] = PRESETS;

if (RECOMMENDED === undefined) {
  throw new Error('the generator has no preset');
}

function ready(): ReadyItem {
  const candidate = generate(RECOMMENDED.settings, 1);
  return {
    n: 1,
    origin: 'seed',
    status: 'ready',
    size: 16,
    seed: 1,
    grid: candidate.grid,
    recipe: withMaze(candidate.recipe, candidate.grid),
    analysis: candidate.analysis,
  };
}

describe('Generate from the editor', () => {
  test('takes a board as blank while it has at most the wall New maze puts east of the start', () => {
    expect(isBlank(borderedMaze(16, 16))).toBe(true);
    expect(isBlank(presetMaze('classic'))).toBe(true);
    const walled = toggleWall(presetMaze('classic'), { direction: 'horizontal', x: 5, y: 5 });
    expect(isBlank(walled)).toBe(false);
  });

  test('makes mazes for square boards of 16 or 32 only', () => {
    expect(generatesFor(borderedMaze(16, 16))).toBe(true);
    expect(generatesFor(borderedMaze(32, 32))).toBe(true);
    expect(generatesFor(borderedMaze(16, 8))).toBe(false);
    expect(generatesFor(borderedMaze(8, 8))).toBe(false);
    expect(unsupportedBoard(borderedMaze(8, 8))).toBe(
      'The generator makes 16 × 16 and 32 × 32 mazes, not 8 × 8: the maze picked opens as a new maze.'
    );
  });

  test('says what Use this does: replace a board of its size, or open a new maze', () => {
    const item = ready();
    const walled = toggleWall(
      toggleWall(borderedMaze(16, 16), { direction: 'horizontal', x: 5, y: 5 }),
      { direction: 'vertical', x: 5, y: 5 }
    );
    const pending: Item = { n: 2, origin: 'seed', status: 'pending', size: 16 };

    expect(replacesBoard(item, walled)).toBe(true);
    expect(replacesBoard(item, borderedMaze(32, 32))).toBe(false);
    expect(pickHint(item, walled)).toBe('Replaces the maze on the board. Undo brings it back.');
    expect(pickHint(item, borderedMaze(16, 16))).toBeUndefined();
    expect(pickHint(item, borderedMaze(8, 8))).toBe(
      'Not the board’s size (8 × 8): opens as a new maze.'
    );
    expect(pickHint(item, undefined)).toBe(
      'Opens as a new maze; the first edit saves it in My mazes.'
    );
    expect(pickHint(pending, undefined)).toBe(
      'Opens as a new maze; the first edit saves it in My mazes.'
    );
  });

  test('steps through the batch, mazes still building included, not past its ends', () => {
    const built = ready();
    const pending: Item = { n: 3, origin: 'seed', status: 'pending', size: 16 };
    const items: Item[] = [built, { ...built, n: 2 }, pending];

    expect(stepTo(items, 0, -1)).toBeUndefined();
    expect(stepTo(items, 0, 1)).toBe(1);
    expect(stepTo(items, 1, 1)).toBe(2);
    expect(stepTo(items, 2, 1)).toBeUndefined();
    expect(stepTo(items, 2, -1)).toBe(1);
  });

  test('reads a mostly sideways swipe of 48 px or more as a step, left for the next maze', () => {
    expect(swipeStep(-60, 10)).toBe(1);
    expect(swipeStep(60, -10)).toBe(-1);
    expect(swipeStep(-40, 0)).toBe(0);
    expect(swipeStep(-60, 40)).toBe(0);
    expect(swipeStep(0, 0)).toBe(0);
  });
});

describe('phaseText', () => {
  test('names what a maze building is at, the attempt from the second board on', () => {
    expect(phaseText(WAITING)).toBe('Building');
    expect(phaseText({ ...WAITING, phase: 'routes', attempt: 1 })).toBe('Trying routes');
    expect(phaseText({ ...WAITING, phase: 'routes', attempt: 12 })).toBe(
      'Trying routes · attempt 12'
    );
    expect(phaseText({ ...WAITING, phase: 'forest' })).toBe('Growing the maze around the routes');
  });
});
