/**
 * Writes `src/library/snapshot.json` from the `vendor/mazefiles` submodule: the commit it pins
 * and, for every maze file in a folder, its path, git blob SHA and compact code with the text
 * after the grid. The file is not committed: the `pre` scripts of `dev`, `build`, `lint`,
 * `typecheck` and the tests run this first, locally and in CI, so a new submodule commit, such as
 * a Dependabot bump, needs nothing else. It leaves a snapshot of the submodule's commit alone
 * while the submodule has no local change; `tests/library/snapshot.test.ts` checks the two agree.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

function current(commit: string): boolean {
  if (!existsSync(OUTPUT) || git('status', '--porcelain') !== '') {
    return false;
  }

  const written: unknown = JSON.parse(readFileSync(OUTPUT, 'utf8'));
  return (
    typeof written === 'object' &&
    written !== null &&
    'commit' in written &&
    written.commit === commit
  );
}

if (!existsSync(join(MAZEFILES, '.git'))) {
  throw new Error('vendor/mazefiles is empty: run git submodule update --init');
}

const commit = git('rev-parse', 'HEAD');

if (current(commit)) {
  console.log(`snapshot.json is already of ${commit.slice(0, 7)}`);
  process.exit(0);
}

const paths = git('ls-tree', '-r', '--name-only', 'HEAD')
  .split('\n')
  .filter((path) => path.includes('/') && path.endsWith('.txt'))
  .toSorted();
const files = await Promise.all(paths.map(snapshotFile));
const lines = files.map((file) => `    ${JSON.stringify(file)}`);

writeFileSync(
  OUTPUT,
  `{\n  "commit": ${JSON.stringify(commit)},\n  "files": [\n${lines.join(',\n')}\n  ]\n}\n`
);
console.log(`${files.length} mazes at ${git('rev-parse', '--short', 'HEAD')} written to ${OUTPUT}`);
