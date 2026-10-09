import { describe, expect, test } from 'vitest';

import {
  decodeMazeCode,
  encodeMazeCode,
  mazesEqual,
  parseMazeText,
  serializeMazeText,
  type Maze,
} from '@/maze';
import { randomMaze, seededRandom } from '@tests/support/maze/random-maze';

const SEED = 0x6d617a65;
const RANDOM_MAZES = 400;
const EXTREME_SIZES = [
  [1, 1],
  [1, 64],
  [64, 1],
  [64, 64],
  [2, 63],
  [63, 2],
] as const;
const TRAILERS = ['', '\n', 'Notes\n', 'Notes', 'ünïcödé ✓\n\n', '  indented\nmore\n'];

function mazes(): Maze[] {
  const random = seededRandom(SEED);
  return [
    ...EXTREME_SIZES.map(([width, height]) => randomMaze(random, { width, height })),
    ...Array.from({ length: RANDOM_MAZES }, () => randomMaze(random)),
  ];
}

describe('round trips over random mazes from a fixed seed', () => {
  const all = mazes();

  test('cover every size class and open borders on every side', () => {
    const widths = new Set(all.map((maze) => maze.width));
    expect(widths.has(1) && widths.has(64)).toBe(true);
    expect(all.some((maze) => !maze.vertical.get(0))).toBe(true);
    expect(all.some((maze) => !maze.vertical.get(maze.width))).toBe(true);
    expect(all.some((maze) => !maze.horizontal.get(0))).toBe(true);
    expect(all.some((maze) => !maze.horizontal.get(maze.width * maze.height))).toBe(true);
    expect(all.some((maze) => maze.start === undefined)).toBe(true);
    expect(all.some((maze) => maze.goals.length > 4)).toBe(true);
  });

  test('parse(serialize(maze)) is the maze and its trailer, with no irregularity, and the same text again', () => {
    const broken = all.filter((maze, index) => {
      const trailer = TRAILERS[index % TRAILERS.length] ?? '';
      const terminated = trailer === '' || trailer.endsWith('\n') ? trailer : `${trailer}\n`;
      const text = serializeMazeText({ maze, trailer });
      const result = parseMazeText(text, 'random.txt');
      return (
        !result.ok ||
        !mazesEqual(result.value.maze, maze) ||
        result.value.trailer !== terminated ||
        result.value.source?.irregularities.length !== 0 ||
        serializeMazeText(result.value) !== serializeMazeText({ maze, trailer: terminated })
      );
    });

    expect(broken.map((maze) => `${maze.width}×${maze.height}`)).toEqual([]);
  });

  test('decode(encode(maze)) is the maze, the trailer and the name', () => {
    const broken = all.filter((maze, index) => {
      const trailer = TRAILERS[index % TRAILERS.length] ?? '';
      const result = decodeMazeCode(encodeMazeCode(maze, { trailer, name: `maze ${index}` }));
      return (
        !result.ok ||
        !mazesEqual(result.value.maze, maze) ||
        result.value.trailer !== trailer ||
        result.value.name !== `maze ${index}`
      );
    });

    expect(broken.map((maze) => `${maze.width}×${maze.height}`)).toEqual([]);
  });
});
