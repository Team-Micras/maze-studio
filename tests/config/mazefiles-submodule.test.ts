import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { MAZEFILES } from '@/library/mazefiles';

const ROOT = join(import.meta.dirname, '..', '..');

describe('the mazefiles submodule', () => {
  test('points at the repository the app credits', () => {
    const modules = readFileSync(join(ROOT, '.gitmodules'), 'utf8');
    expect(modules).toContain('path = vendor/mazefiles');
    expect(modules).toContain(`url = ${MAZEFILES.url}`);
    expect(MAZEFILES.url).toBe(`https://github.com/${MAZEFILES.owner}/${MAZEFILES.name}`);
  });

  test('is checked out at the commit the repository pins', () => {
    const status = execFileSync('git', ['submodule', 'status', 'vendor/mazefiles'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(status).toMatch(/^ [0-9a-f]{40} vendor\/mazefiles/);
    expect(readFileSync(join(ROOT, 'vendor/mazefiles/test_mazes.py'), 'utf8')).toContain(
      'def test_'
    );
  });
});
