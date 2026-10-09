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
  profileOfPath,
  serializeMazeText,
  validateMaze,
  type MazeText,
} from '@/maze';

const MAZEFILES = join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles');
/**
 * The fewest maze files the repository is expected to hold: a sanity bound, loose enough that new
 * mazes never break it, tight enough to catch an empty or half-read submodule.
 */
const AT_LEAST_FILES = 500;

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

describe('every maze file of the commit the submodule pins', () => {
  test('is there, at least 500 of them in the repository folders', () => {
    expect(files.length).toBeGreaterThanOrEqual(AT_LEAST_FILES);
    expect(files.every((file) => /^[^/]+\/[^/]+\.txt$/.test(file.path))).toBe(true);
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

  test('has no error under the profile of its folder', () => {
    const errors: string[] = [];
    const sizes: Record<string, number> = {};
    const filesByRule: Record<string, number> = {};

    for (const file of files) {
      const { maze, source } = parsed(file);
      const found = validateMaze({ maze, source, profile: profileOfPath(file.path) });
      errors.push(
        ...found
          .filter((finding) => finding.severity === 'error')
          .map((finding) => `${file.path} ${finding.rule}`)
      );
      const size = `${file.path.split('/')[0]} ${maze.width}×${maze.height}`;
      sizes[size] = (sizes[size] ?? 0) + 1;

      for (const rule of new Set(found.map((finding) => finding.rule))) {
        filesByRule[rule] = (filesByRule[rule] ?? 0) + 1;
      }
    }

    console.info(
      `mazefiles at ${git('rev-parse', '--short', 'HEAD').trim()}: ${files.length} files`,
      sizes,
      'files per rule',
      filesByRule
    );
    expect(errors).toEqual([]);
  });
});
