import { describe, expect, test } from 'vitest';

import {
  Bits,
  createMaze,
  mazesEqual,
  parseMazeText,
  serializeMazeText,
  type MazeText,
  type MazeTextError,
} from '@/maze';

const TWO_BY_TWO = ['o---o---o', '| G     |', 'o   o---o', '| S |   |', 'o---o---o', ''].join('\n');

function parsed(text: string, fileName = 'test.txt'): MazeText {
  const result = parseMazeText(text, fileName);

  if (!result.ok) {
    throw new Error(`${result.error.line}:${result.error.column} ${result.error.message}`);
  }

  return result.value;
}

function refused(text: string): Omit<MazeTextError, 'message'> {
  const result = parseMazeText(text, 'test.txt');

  if (result.ok) {
    throw new Error('the text was read as a maze');
  }

  return { line: result.error.line, column: result.error.column };
}

function kinds(text: string): string[] | undefined {
  return parsed(text).source?.irregularities.map(({ kind, line }) => `${kind}@${line}`);
}

function walls(segment: string): [boolean, number | undefined] {
  const document = parsed(`o${segment}o\n|   |\no---o\n`);
  return [document.maze.horizontal.get(1), document.source?.irregularities.length];
}

describe('reading the mazefiles text', () => {
  test('reads walls, start and goals with (0, 0) in the south-west corner', () => {
    const document = parsed(TWO_BY_TWO, 'classic/two.txt');
    const expected = createMaze({
      width: 2,
      height: 2,
      horizontal: Bits.from(6, (index) => index !== 2),
      vertical: Bits.from(6, (index) => index !== 4),
      start: { x: 0, y: 0 },
      goals: [{ x: 0, y: 1 }],
    });

    expect(mazesEqual(document.maze, expected)).toBe(true);
    expect(document.trailer).toBe('');
    expect(document.source).toEqual({
      fileName: 'classic/two.txt',
      irregularities: [],
      hadCR: false,
      hadFinalNewline: true,
    });
  });

  test('writes the same text back, byte for byte', () => {
    expect(serializeMazeText(parsed(TWO_BY_TWO))).toBe(TWO_BY_TWO);
  });

  test('ends the grid by its shape, so a cell line may start with a space', () => {
    const openWest = ['o---o', '  S |', 'o   o', '    |', 'o---o', ''].join('\n');
    const document = parsed(openWest);

    expect(document.maze.height).toBe(2);
    expect(document.maze.vertical.get(0)).toBe(false);
    expect(document.maze.start).toEqual({ x: 0, y: 1 });
    expect(serializeMazeText(document)).toBe(openWest);
  });

  test('keeps everything after the line feed of the last grid line as the trailer', () => {
    expect(parsed(`${TWO_BY_TWO}\n`).trailer).toBe('\n');
    expect(parsed(`${TWO_BY_TWO}Notes: a maze\nfrom 2024\n`).trailer).toBe(
      'Notes: a maze\nfrom 2024\n'
    );
    expect(parsed(`${TWO_BY_TWO}| not grid\n`).trailer).toBe('| not grid\n');

    for (const trailer of ['\n', 'Notes\n\n', 'ünïcödé ✓\n']) {
      const text = `${TWO_BY_TWO}${trailer}`;
      expect(serializeMazeText(parsed(text))).toBe(text);
    }
  });

  test('accepts carriage returns and a missing final line feed, and says it did', () => {
    const crlf = parsed(TWO_BY_TWO.replaceAll('\n', '\r\n'));
    expect(crlf.source?.hadCR).toBe(true);
    expect(crlf.source?.hadFinalNewline).toBe(true);
    expect(serializeMazeText(crlf)).toBe(TWO_BY_TWO);

    const unterminated = parsed(TWO_BY_TWO.slice(0, -1));
    expect(unterminated.source?.hadCR).toBe(false);
    expect(unterminated.source?.hadFinalNewline).toBe(false);
    expect(serializeMazeText(unterminated)).toBe(TWO_BY_TWO);

    const notes = parsed(`${TWO_BY_TWO}Notes`);
    expect(notes.trailer).toBe('Notes\n');
    expect(notes.source?.hadFinalNewline).toBe(false);
  });

  test('reads irregularities in a fixed way, reports them in file order, and writes them canonical', () => {
    const text = ['o-- o---o', '| X   G :', 'o   o - o', '|xS | S |', 'o---o---o', 'o---', ''].join(
      '\n'
    );
    const document = parsed(text);

    expect(document.source?.irregularities).toEqual([
      { kind: 'wall', line: 1, column: 2, found: '-- ' },
      { kind: 'cell', line: 2, column: 2, found: ' X ' },
      { kind: 'wall', line: 2, column: 9, found: ':' },
      { kind: 'wall', line: 3, column: 6, found: ' - ' },
      { kind: 'cell', line: 4, column: 2, found: 'xS ' },
      { kind: 'extra-start', line: 4, column: 7, found: 'S' },
      { kind: 'ragged-line', line: 6, column: 1, found: 'o---' },
    ]);

    const { maze } = document;
    expect(maze.horizontal.get(4)).toBe(true);
    expect(maze.horizontal.get(3)).toBe(true);
    expect(maze.vertical.get(5)).toBe(false);
    expect(maze.start).toEqual({ x: 0, y: 0 });
    expect(maze.goals).toEqual([{ x: 1, y: 1 }]);
    expect(serializeMazeText(document)).toBe(
      ['o---o---o', '|     G  ', 'o   o---o', '| S |   |', 'o---o---o', 'o---', ''].join('\n')
    );
  });

  test('reads a cell line cut short, as when trailing spaces are stripped, as padded with spaces', () => {
    const lines = ['o---o---o', '|   |   |', 'o---o---o', '  S      ', 'o---o---o', ''];
    const document = parsed(lines.map((line) => line.trimEnd()).join('\n'));

    expect(document.maze.width).toBe(2);
    expect(document.maze.height).toBe(2);
    expect(document.maze.start).toEqual({ x: 0, y: 0 });
    expect(document.maze.vertical.get(0)).toBe(false);
    expect(document.maze.vertical.get(2)).toBe(false);
    expect(document.trailer).toBe('');
    expect(document.source?.irregularities).toEqual([
      { kind: 'short-line', line: 4, column: 4, found: '' },
    ]);
    expect(serializeMazeText(document)).toBe(lines.join('\n'));
  });

  test('reports a trailer line that looks like grid starting with a space', () => {
    expect(kinds(`${TWO_BY_TWO}  S     # note\no---o---o\n`)).toEqual(['ragged-line@6']);
    expect(kinds(`${TWO_BY_TWO}  S\no---o--\n`)).toEqual(['ragged-line@6']);
    expect(kinds(`${TWO_BY_TWO}  S`)).toEqual(['ragged-line@6']);
    expect(kinds(`${TWO_BY_TWO}  | G |\n`)).toEqual(['ragged-line@6']);
    expect(kinds(`${TWO_BY_TWO}  indented note\nmore\n`)).toEqual([]);
    expect(kinds(`${TWO_BY_TWO}\n`)).toEqual([]);
  });

  test('reads two mazes split by a blank line as one, and reports it', () => {
    const document = parsed(`${TWO_BY_TWO}\n${TWO_BY_TWO}`);

    expect([document.maze.width, document.maze.height]).toEqual([2, 5]);
    expect(kinds(`${TWO_BY_TWO}\n${TWO_BY_TWO}`)).toEqual(['short-line@6', 'extra-start@10']);
  });

  test('reads an empty cell line as a row with no walls and no marks when posts follow it', () => {
    const document = parsed('o---o\n\no---o\n');
    expect(document.maze.height).toBe(1);
    expect(document.maze.vertical.equals(Bits.from(2))).toBe(true);
    expect(document.source?.irregularities).toEqual([
      { kind: 'short-line', line: 2, column: 1, found: '' },
    ]);
  });

  test('keeps a short line that no line of posts follows in the trailer', () => {
    const document = parsed(`${TWO_BY_TWO}  indented\nmore\n`);
    expect(document.maze.height).toBe(2);
    expect(document.trailer).toBe('  indented\nmore\n');
    expect(document.source?.irregularities).toEqual([]);
  });

  test('takes an east–west wall from the middle character of its segment', () => {
    expect(walls('---')).toEqual([true, 0]);
    expect(walls('   ')).toEqual([false, 0]);
    expect(walls(' - ')).toEqual([true, 1]);
    expect(walls('-- ')).toEqual([true, 1]);
    expect(walls('-  ')).toEqual([false, 1]);
    expect(walls('  -')).toEqual([false, 1]);
  });

  test('gives back frozen documents', () => {
    const document = parsed(`o-- o\n|   |\no---o\n`);
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.source)).toBe(true);
    expect(Object.isFrozen(document.source?.irregularities)).toBe(true);
    expect(Object.isFrozen(document.source?.irregularities[0])).toBe(true);
  });

  test('warns about a trailer too long for a link', () => {
    const document = parsed(`${TWO_BY_TWO}${'a'.repeat(70_000)}\n`);
    expect(document.source?.irregularities).toEqual([
      { kind: 'long-trailer', line: 6, column: 1, found: '70001 bytes' },
    ]);
  });

  test('counts the trailer in bytes of UTF-8, not in characters', () => {
    const fits = parsed(`${TWO_BY_TWO}${'é'.repeat(32_767)}`);
    const over = parsed(`${TWO_BY_TWO}${'é'.repeat(40_000)}`);

    expect(fits.source?.irregularities).toEqual([]);
    expect(over.source?.irregularities).toEqual([
      { kind: 'long-trailer', line: 6, column: 1, found: '80001 bytes' },
    ]);
  });

  test('refuses what is not a maze, with the line and column', () => {
    expect(refused('')).toEqual({ line: 1, column: 1 });
    expect(refused('x---o\n')).toEqual({ line: 1, column: 1 });
    expect(refused('o---x\n')).toEqual({ line: 1, column: 5 });
    expect(refused('o---o--\n')).toEqual({ line: 1, column: 8 });
    expect(refused('o\n|\no\n')).toEqual({ line: 1, column: 2 });
    expect(refused('o---o\n')).toEqual({ line: 2, column: 1 });
    expect(refused('o---o\n:   |\no---o\n')).toEqual({ line: 2, column: 1 });
    expect(refused('o---o\n|   |xx\no---o\n')).toEqual({ line: 2, column: 6 });
    expect(refused('o---o\n|  \nfoo\n')).toEqual({ line: 3, column: 1 });
    expect(refused('o---o\n|  \no--o\n')).toEqual({ line: 3, column: 5 });
    expect(refused('o---o\n|   |\nfoo\n')).toEqual({ line: 3, column: 1 });
    expect(refused('o---o\n|   |\no---\n')).toEqual({ line: 3, column: 5 });
    expect(refused('o---o\n|   |\no--- o\n')).toEqual({ line: 3, column: 5 });
    expect(refused('o---o\n|   |\n')).toEqual({ line: 3, column: 1 });
  });

  test('refuses a maze past 64 cells a side', () => {
    expect(refused(`${'o---'.repeat(65)}o\n`)).toEqual({ line: 1, column: 258 });
    expect(refused(`${'o---o\n|   |\n'.repeat(65)}o---o\n`)).toEqual({ line: 130, column: 1 });
    expect(parsed(`${'o---o\n|   |\n'.repeat(64)}o---o\n`).maze.height).toBe(64);
    expect(
      parsed(`${'o---'.repeat(64)}o\n${'|   '.repeat(64)}|\n${'o---'.repeat(64)}o\n`).maze.width
    ).toBe(64);
  });
});
