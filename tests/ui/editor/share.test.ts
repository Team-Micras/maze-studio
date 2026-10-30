import { describe, expect, test } from 'vitest';

import { decodeMazeCode, createMaze, mazesEqual } from '@/maze';
import {
  downloadName,
  linkDropsNotes,
  mazeFileText,
  mazeLink,
  mazeMarkdown,
} from '@/ui/editor/share';
import type { OpenMaze } from '@/ui/open-maze';

const MAZE = createMaze({ width: 3, height: 2 });

function open(name: string, trailer = '', key = 'mine:u'): OpenMaze {
  return { key, maze: MAZE, name, detail: '', document: { trailer, profile: 'free' } };
}

function repoFile(name: string, path: string): OpenMaze {
  const opened = open(name, '', `repo:${path}`);
  return {
    ...opened,
    document: {
      ...opened.document,
      source: { fileName: path, irregularities: [], hadCR: false, hadFinalNewline: true },
    },
  };
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

  test('writes Markdown of the SVG, linked by route for a repository maze, else by its link', () => {
    const page = 'https://example.org/maze-studio/?theme=dark#/';
    const repo = repoFile('AAMC15Maze', 'classic/AAMC15Maze.txt');
    const edited = open('AAMC15Maze (edited)', '', 'repo:classic/AAMC15Maze.txt');
    const mine = open('Run [2] \\ final');

    expect(mazeMarkdown(repo, page)).toBe(
      '[![AAMC15Maze](AAMC15Maze.svg)](<https://example.org/maze-studio/?theme=dark#/repo/classic/AAMC15Maze.txt>)'
    );
    expect(mazeMarkdown(edited, page)).toBe(
      `[![AAMC15Maze (edited)](AAMC15Maze-edited.svg)](<${mazeLink(edited, page)}>)`
    );
    expect(mazeMarkdown(mine, page)).toBe(
      `[![Run \\[2\\] \\\\ final](${downloadName(mine, '.svg')})](<${mazeLink(mine, page)}>)`
    );
  });
});
