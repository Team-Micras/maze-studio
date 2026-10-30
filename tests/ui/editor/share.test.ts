import { describe, expect, test } from 'vitest';

import { decodeMazeCode, createMaze, mazesEqual } from '@/maze';
import { downloadName, linkDropsNotes, mazeFileText, mazeLink } from '@/ui/editor/share';
import type { OpenMaze } from '@/ui/open-maze';

const MAZE = createMaze({ width: 3, height: 2 });

function open(name: string, trailer = ''): OpenMaze {
  return { key: 'mine:u', maze: MAZE, name, detail: '', document: { trailer, profile: 'free' } };
}

describe('Sharing a maze', () => {
  test('makes a link to the same maze and name, on the page it is on', () => {
    const link = new URL(
      mazeLink(open('Practice run'), 'https://example.org/maze-studio/#/mine/u')
    );
    const decoded = decodeMazeCode(decodeURIComponent(link.hash.replace('#/m/', '')));

    expect(link.pathname).toBe('/maze-studio/');
    expect(decoded.ok && mazesEqual(decoded.value.maze, MAZE)).toBe(true);
    expect(decoded.ok ? decoded.value.name : undefined).toBe('Practice run');
  });

  test('knows when the notes after the grid stay out of the link', () => {
    expect(linkDropsNotes(open('a'))).toBe(false);
    expect(linkDropsNotes(open('a', 'notes\n'))).toBe(true);
  });

  test('downloads under a stem that passes the name rule, with the notes', () => {
    expect(downloadName(open('AAMC15Maze (edited)'))).toBe('AAMC15Maze-edited.txt');
    expect(downloadName(open('Ünïcode naME!'))).toBe('Unicode-naME.txt');
    expect(mazeFileText(open('a', 'notes\n')).endsWith('\nnotes\n')).toBe(true);
  });
});
