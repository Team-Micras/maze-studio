import { describe, expect, test } from 'vitest';

import { hasWall } from '@/maze';
import { newMazeName, openNewMaze, sideOf, UNTITLED } from '@/ui/new-maze';

describe('A new maze', () => {
  test('is "Untitled maze", made unique among the names of My mazes', () => {
    expect(newMazeName('', [])).toBe(UNTITLED);
    expect(newMazeName('  ', ['untitled MAZE'])).toBe('Untitled maze 2');
    expect(newMazeName(' Practice ', ['Untitled maze'])).toBe('Practice');
  });

  test('of a preset opens with its profile and marks, under a key of its own', () => {
    const open = openNewMaze({ kind: 'preset', preset: 'halfsize' }, 3, ['Untitled maze']);

    expect(open.key).toBe('new:3');
    expect(open.name).toBe('Untitled maze 2');
    expect(open.detail).toBe('New maze, 32 × 32');
    expect(open.document).toEqual({ trailer: '', profile: 'halfsize', created: true });
    expect(open.maze.start).toEqual({ x: 0, y: 0 });
  });

  test('of a custom size has only its border, under the rules and name given', () => {
    const open = openNewMaze(
      { kind: 'custom', width: 7, height: 5, profile: 'training', name: 'Seven' },
      1,
      []
    );

    expect([open.maze.width, open.maze.height]).toEqual([7, 5]);
    expect(open.maze.start).toBeUndefined();
    expect(open.maze.goals).toEqual([]);
    expect(hasWall(open.maze, { direction: 'vertical', x: 7, y: 4 })).toBe(true);
    expect(hasWall(open.maze, { direction: 'vertical', x: 3, y: 2 })).toBe(false);
    expect(open.document.profile).toBe('training');
    expect(open.name).toBe('Seven');
  });
});

describe('A side of the Custom size dialog', () => {
  test('is a whole number from 1 to 64', () => {
    expect(sideOf('1')).toBe(1);
    expect(sideOf(' 64 ')).toBe(64);
    expect(sideOf('0')).toBeUndefined();
    expect(sideOf('65')).toBeUndefined();
    expect(sideOf('7.5')).toBeUndefined();
    expect(sideOf('')).toBeUndefined();
    expect(sideOf('abc')).toBeUndefined();
  });
});
