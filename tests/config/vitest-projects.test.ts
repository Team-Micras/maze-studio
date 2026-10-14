import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createVitest } from 'vitest/node';
import { afterAll, beforeAll, expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const PERFORMANCE_FILE = /-performance\.test\.tsx?$/;
const { scripts }: { scripts: Record<string, string> } = JSON.parse(
  readFileSync(join(ROOT, 'package.json'), 'utf8')
);

function expand(script: string): string {
  return script
    .split('&&')
    .map((step) => step.trim())
    .map((step) => {
      const name = /^bun run (\S+)$/.exec(step)?.[1];
      return name !== undefined && scripts[name] !== undefined ? expand(scripts[name]) : step;
    })
    .join(' && ');
}

function projectsRunBy(script: string): string[] {
  return [...expand(script).matchAll(/--project (\S+)/g)].map(([, name]) => name);
}

const files = new Map<string, string[]>();

beforeAll(async () => {
  const vitest = await createVitest('test', { watch: false, root: ROOT });

  try {
    for (const specification of await vitest.globTestSpecifications()) {
      const name = specification.project.name.replace(/ \(.*\)$/, '');
      files.set(name, [...(files.get(name) ?? []), specification.moduleId]);
    }
  } finally {
    await vitest.close();
  }
});

afterAll(() => files.clear());

test('the check runs no performance test, which test:performance runs alone', () => {
  const checked = projectsRunBy(scripts.check);
  const checkedFiles = checked.flatMap((name) => files.get(name) ?? []);

  expect(checked.toSorted()).toEqual(['browser', 'e2e', 'unit']);
  expect(checkedFiles.filter((file) => PERFORMANCE_FILE.test(file))).toEqual([]);
  expect((files.get('performance') ?? []).every((file) => PERFORMANCE_FILE.test(file))).toBe(true);
  expect(files.get('performance')?.length).toBeGreaterThan(0);
  expect(projectsRunBy(scripts['test:performance'])).toEqual(['performance']);
});
