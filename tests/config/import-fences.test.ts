import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const OXLINT = join(ROOT, 'node_modules', '.bin', 'oxlint');

/**
 * A file of the tree, an import it makes, whether the fences of `.oxlintrc.json` refuse it, and
 * the form of the import: `import * as` unless it is a dynamic `import()` or a named import.
 */
type Fence = readonly [
  file: string,
  specifier: string,
  refused: boolean,
  form?: 'dynamic' | 'named',
];

const FENCES: readonly Fence[] = [
  ['src/maze/probe.ts', './walls', false],
  ['src/maze/deep/probe.ts', '../walls', false],
  ['src/maze/probe.ts', '@/maze/walls', true],
  ['src/maze/probe.ts', '@/library/mazefiles', true],
  ['src/maze/probe.ts', '../library/mazefiles', true],
  ['src/maze/probe.ts', '@/render/svg', true],
  ['src/maze/probe.ts', '../render/svg', true],
  ['src/maze/probe.ts', '@/ui/app', true],
  ['src/maze/probe.ts', '../ui/app', true],
  ['src/maze/probe.ts', '../main', true],
  ['src/maze/probe.ts', 'react', true],
  ['src/maze/probe.ts', '@tests/support/axe-check', true],
  ['src/maze/probe.ts', '../../scripts/bundle-size', true],
  ['src/maze/deep/probe.ts', '../../ui/app', true],
  ['src/maze/probe.ts', 'node:fs', true],
  ['src/maze/probe.ts', '../../vendor/mazefiles/README.md', true],
  ['src/maze/lazy-probe.ts', '../ui/app', true, 'dynamic'],
  ['src/maze/lazy-probe.ts', './walls', false, 'dynamic'],

  ['src/library/probe.ts', '@/maze/walls', false],
  ['src/library/probe.ts', '../maze/walls', false],
  ['src/library/probe.ts', './mazefiles', false],
  ['src/library/probe.ts', '@/library/mazefiles', true],
  ['src/library/probe.ts', '@/render/svg', true],
  ['src/library/probe.ts', '../render/svg', true],
  ['src/library/probe.ts', '@/ui/app', true],
  ['src/library/probe.ts', '../ui/app', true],
  ['src/library/probe.ts', 'react', true],
  ['src/library/probe.ts', 'react-dom/client', true],
  ['src/library/probe.ts', '@scripts/bundle-size', true],
  ['src/library/deep/probe.ts', '../../maze/walls', false],
  ['src/library/deep/probe.ts', '../../render/svg', true],
  ['src/library/probe.ts', '../../vendor/mazefiles/README.md', true],
  ['src/library/lazy-probe.ts', '../ui/app', true, 'dynamic'],
  ['src/library/lazy-probe.ts', '@/render/svg', true, 'dynamic'],
  ['src/library/lazy-probe.ts', '../maze/walls', false, 'dynamic'],

  ['src/render/probe.ts', '@/maze/walls', false],
  ['src/render/probe.ts', '../maze/walls', false],
  ['src/render/probe.ts', './svg', false],
  ['src/render/probe.ts', '@/render/svg', true],
  ['src/render/probe.ts', '@/library/mazefiles', true],
  ['src/render/probe.ts', '../library/mazefiles', true],
  ['src/render/probe.ts', '@/ui/app', true],
  ['src/render/probe.ts', '../ui/app', true],
  ['src/render/probe.ts', 'react', true],
  ['src/render/probe.ts', '@tests/support/axe-check', true],
  ['src/render/deep/probe.ts', '../../library/mazefiles', true],

  ['src/ui/probe.ts', '@/maze/walls', false],
  ['src/ui/probe.ts', '@/library/mazefiles', false],
  ['src/ui/probe.ts', '@/render/svg', false],
  ['src/ui/probe.ts', '@/ui/primitives/utils', false],
  ['src/ui/probe.ts', 'react', false],
  ['src/ui/probe.ts', '@/main', true],
  ['src/ui/probe.ts', '../main', true],
  ['src/ui/probe.ts', '@tests/support/axe-check', true],
  ['src/ui/probe.ts', '../../tests/support/axe-check', true],
  ['src/ui/probe.ts', '@scripts/bundle-size', true],
  ['src/ui/probe.ts', '../../vendor/mazefiles/README.md', true],
  ['src/ui/lazy-probe.ts', '@/render/svg', false, 'dynamic'],
  ['src/ui/probe.ts', '@phosphor-icons/react', true],
  ['src/ui/named-probe.ts', '@phosphor-icons/react', false, 'named'],
  ['src/ui/probe.ts', '@phosphor-icons/react/dist/ssr', true],
  ['src/ui/named-probe.ts', '@phosphor-icons/react/dist/ssr', true, 'named'],

  ['src/main.tsx', '@/ui/app', false],
  ['src/main.tsx', 'react', false],
  ['src/main.tsx', '@tests/support/axe-check', true],

  ['scripts/probe.ts', '../src/maze/walls', false],
  ['scripts/probe.ts', '@/library/mazefiles', false],
  ['scripts/probe.ts', '@/render/svg', true],
  ['scripts/probe.ts', '../src/ui/app', true],
  ['scripts/probe.ts', 'react', true],
  ['scripts/probe.ts', '../tests/support/axe-check', true],
  ['scripts/probe.ts', 'node:fs', false],
];

const refused = new Map<string, Set<string>>();

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'import-fences-'));
  const config = JSON.parse(readFileSync(join(ROOT, '.oxlintrc.json'), 'utf8'));
  delete config.$schema;
  config.options = { ...config.options, typeAware: false, denyWarnings: false };
  writeFileSync(join(dir, '.oxlintrc.json'), JSON.stringify(config));

  const files = new Map<string, string[]>();
  for (const [file, specifier, , form] of FENCES) {
    const index = files.get(file)?.length ?? 0;
    const lines = {
      dynamic: `export const p${index} = () => import('${specifier}');`,
      named: `import { SquaresFour as p${index} } from '${specifier}';\nexport { p${index} };`,
      namespace: `import * as p${index} from '${specifier}';\nexport { p${index} };`,
    };
    const line = lines[form ?? 'namespace'];
    files.set(file, [...(files.get(file) ?? []), line]);
  }

  for (const [file, lines] of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), `${lines.join('\n')}\n`);
  }

  const run = spawnSync(OXLINT, ['-c', '.oxlintrc.json', '-f', 'json', ...files.keys()], {
    cwd: dir,
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });

  const report: { diagnostics: { code: string; filename: string; message: string }[] } = JSON.parse(
    run.stdout
  );
  for (const { code, filename, message } of report.diagnostics) {
    const specifier =
      /^'([^']+)' import is restricted/.exec(message)?.[1] ??
      /^\* import is invalid because .* from '([^']+)'/.exec(message)?.[1];
    if (code === 'eslint(no-restricted-imports)' && specifier !== undefined) {
      refused.set(filename, (refused.get(filename) ?? new Set()).add(specifier));
    }
  }
});

afterAll(() => refused.clear());

describe('the import fences of .oxlintrc.json', () => {
  const cases = FENCES.map(
    ([file, specifier, expected, form]) =>
      [
        file,
        form === 'dynamic'
          ? `import('${specifier}')`
          : form === 'named'
            ? `{ SquaresFour } from ${specifier}`
            : specifier,
        expected,
        specifier,
      ] as const
  );

  test.each(cases)('%s importing %s is refused: %s', (file, _shown, expected, specifier) => {
    expect(refused.get(file)?.has(specifier) ?? false).toBe(expected);
  });
});
