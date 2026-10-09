import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, test } from 'vitest';

import {
  decodeMazeCode,
  encodeMazeCode,
  mazesEqual,
  parseMazeText,
  serializeMazeText,
  type MazeText,
} from '@/maze';

const MAZEFILES = join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles');
const PINNED_COMMIT = '548dcdeb359bbd3aca997371f8542ec9644840ce';
const DOUBLE_NEWLINE = ['halfsize/japan2008hes.txt', 'halfsize/japan2016hef.txt'];

/** The size tallies of the pinned commit, by folder: `<folder> <width>×<height>` → files. */
const SIZES_AT_PINNED_COMMIT = {
  'classic 16×16': 523,
  'training 16×16': 16,
  'halfsize 32×32': 33,
  'halfsize 21×21': 6,
  'halfsize 16×16': 3,
};

interface MazeFile {
  readonly path: string;
  readonly blob: string;
  readonly bytes: Buffer;
}

function gitBlobSha(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function git(...args: string[]): string {
  return execFileSync('git', ['-C', MAZEFILES, ...args], { encoding: 'utf8' });
}

function parsed(file: MazeFile): MazeText {
  const result = parseMazeText(file.bytes.toString('utf8'), file.path);

  if (!result.ok) {
    throw new Error(
      `${file.path}:${result.error.line}:${result.error.column} ${result.error.message}`
    );
  }

  return result.value;
}

function committedMazeFiles(): MazeFile[] {
  return git('ls-tree', '-r', 'HEAD')
    .trim()
    .split('\n')
    .flatMap((line) => {
      const [, blob, path] = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line) ?? [];
      return blob !== undefined && path?.endsWith('.txt') && path.includes('/')
        ? [{ path, blob, bytes: readFileSync(join(MAZEFILES, path)) }]
        : [];
    });
}

let files: MazeFile[] = [];

beforeAll(() => {
  files = committedMazeFiles();
});

describe('every maze file of the pinned mazefiles commit', () => {
  test('is the commit the plan was checked against, with its 581 mazes', () => {
    expect(git('rev-parse', 'HEAD').trim()).toBe(PINNED_COMMIT);
    expect(files).toHaveLength(581);
    expect(new Set(files.map((file) => file.path.split('/')[0]))).toEqual(
      new Set(['classic', 'halfsize', 'training'])
    );
  });

  test('is read from disk exactly as committed: its git blob SHA matches', () => {
    expect(
      files.filter((file) => gitBlobSha(file.bytes) !== file.blob).map((file) => file.path)
    ).toEqual([]);
  });

  test('reads with no irregularity and writes back byte for byte', () => {
    const unclean = files.filter((file) => {
      const { source } = parsed(file);
      return (
        source?.fileName !== file.path ||
        source.irregularities.length > 0 ||
        source.hadCR ||
        !source.hadFinalNewline
      );
    });
    const rewritten = files.filter((file) => {
      const written = Buffer.from(serializeMazeText(parsed(file)), 'utf8');
      return !written.equals(file.bytes) || gitBlobSha(written) !== file.blob;
    });

    expect(unclean.map((file) => file.path)).toEqual([]);
    expect(rewritten.map((file) => file.path)).toEqual([]);
  });

  test('keeps the second line feed of the two files that end in two', () => {
    const trailers = files
      .map((file) => [file.path, parsed(file).trailer] as const)
      .filter(([, trailer]) => trailer !== '');
    expect(trailers).toEqual(DOUBLE_NEWLINE.map((path) => [path, '\n']));
  });

  test('round-trips through the compact code with its trailer', () => {
    const broken = files.filter((file) => {
      const { maze, trailer } = parsed(file);
      const result = decodeMazeCode(encodeMazeCode(maze, { trailer }));
      return (
        !result.ok ||
        !mazesEqual(result.value.maze, maze) ||
        serializeMazeText(result.value) !== file.bytes.toString('utf8')
      );
    });

    expect(broken.map((file) => file.path)).toEqual([]);
  });

  test('has the sizes the plan counted at the pinned commit', () => {
    const sizes: Record<string, number> = {};

    for (const file of files) {
      const { maze } = parsed(file);
      const key = `${file.path.split('/')[0]} ${maze.width}×${maze.height}`;
      sizes[key] = (sizes[key] ?? 0) + 1;
    }

    expect(sizes).toEqual(SIZES_AT_PINNED_COMMIT);
  });
});
