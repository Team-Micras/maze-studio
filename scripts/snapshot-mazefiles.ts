/**
 * Writes `src/library/snapshot.json` from the `vendor/mazefiles` submodule: the commit it pins
 * and, for every maze file in a folder, its path, git blob SHA and compact code with the text
 * after the grid. Run it with `bun run snapshot` after moving the submodule to a new commit; CI
 * never runs it, and `tests/library/snapshot.test.ts` fails while the two disagree.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { encodeMazeCode, parseMazeText } from '@/maze';
import { gitBlobSha } from '@/library/blob-sha';
import type { RepoFile } from '@/library/snapshot';

const ROOT = join(import.meta.dirname, '..');
const MAZEFILES = join(ROOT, 'vendor', 'mazefiles');
const OUTPUT = join(ROOT, 'src', 'library', 'snapshot.json');

function git(...args: string[]): string {
  return execFileSync('git', ['-C', MAZEFILES, ...args], { encoding: 'utf8' }).trim();
}

async function snapshotFile(path: string): Promise<RepoFile> {
  const bytes = readFileSync(join(MAZEFILES, path));
  const parsed = parseMazeText(new TextDecoder().decode(bytes), path);

  if (!parsed.ok) {
    throw new Error(`${path}:${parsed.error.line}:${parsed.error.column} ${parsed.error.message}`);
  }

  return {
    path,
    sha: await gitBlobSha(bytes),
    code: encodeMazeCode(parsed.value.maze, { trailer: parsed.value.trailer }),
  };
}

const paths = git('ls-tree', '-r', '--name-only', 'HEAD')
  .split('\n')
  .filter((path) => path.includes('/') && path.endsWith('.txt'))
  .toSorted();
const files = await Promise.all(paths.map(snapshotFile));
const lines = files.map((file) => `    ${JSON.stringify(file)}`);

writeFileSync(
  OUTPUT,
  `{\n  "commit": ${JSON.stringify(git('rev-parse', 'HEAD'))},\n  "files": [\n${lines.join(',\n')}\n  ]\n}\n`
);
console.log(`${files.length} mazes at ${git('rev-parse', '--short', 'HEAD')} written to ${OUTPUT}`);
