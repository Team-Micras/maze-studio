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

const LAYERS = ['maze', 'library', 'render', 'generator', 'ui', 'main'] as const;

type Layer = (typeof LAYERS)[number];

/**
 * What each folder may import by any path, and what only by relative path, as ARCHITECTURE.md's
 * table has it; every other layer is refused.
 */
const MAY_IMPORT: Record<Layer | 'scripts', { any: readonly Layer[]; relative: readonly Layer[] }> =
  {
    maze: { any: [], relative: ['maze'] },
    library: { any: ['maze'], relative: ['library'] },
    render: { any: ['maze'], relative: ['render'] },
    generator: { any: ['maze'], relative: ['generator'] },
    ui: { any: ['maze', 'library', 'render', 'generator', 'ui'], relative: [] },
    main: { any: ['maze', 'library', 'render', 'ui'], relative: [] },
    scripts: { any: ['maze', 'library'], relative: [] },
  };

/** Where each folder's probes sit and the prefixes that reach `src/` from them, alias first. */
const PROBES: Record<Layer | 'scripts', readonly (readonly [file: string, prefix: string])[]> = {
  maze: [
    ['src/maze/probe.ts', '@/'],
    ['src/maze/probe.ts', '../'],
    ['src/maze/deep/probe.ts', '../../'],
  ],
  library: [
    ['src/library/probe.ts', '@/'],
    ['src/library/probe.ts', '../'],
    ['src/library/deep/probe.ts', '../../'],
  ],
  render: [
    ['src/render/probe.ts', '@/'],
    ['src/render/probe.ts', '../'],
    ['src/render/deep/probe.ts', '../../'],
  ],
  generator: [
    ['src/generator/probe.ts', '@/'],
    ['src/generator/probe.ts', '../'],
    ['src/generator/deep/probe.ts', '../../'],
  ],
  ui: [
    ['src/ui/probe.ts', '@/'],
    ['src/ui/probe.ts', '../'],
    ['src/ui/deep/probe.ts', '../../'],
  ],
  main: [
    ['src/main.tsx', '@/'],
    ['src/main.tsx', './'],
  ],
  scripts: [
    ['scripts/probe.ts', '@/'],
    ['scripts/probe.ts', '../src/'],
  ],
};

/** Every folder importing every layer in every form, refused unless {@link MAY_IMPORT} allows it. */
const LAYER_FENCES: readonly Fence[] = [...LAYERS, 'scripts' as const].flatMap((from) =>
  PROBES[from].flatMap(([file, prefix]) =>
    LAYERS.filter((target) => target !== 'main' || from !== 'main').map((target): Fence => {
      const allowed = MAY_IMPORT[from];
      const ok =
        allowed.any.includes(target) || (prefix !== '@/' && allowed.relative.includes(target));
      return [file, `${prefix}${target === 'main' ? 'main' : `${target}/target`}`, !ok];
    })
  )
);

/** The fences that are not about layers: React, Node, tests and scripts, icons, other forms. */
const OTHER_FENCES: readonly Fence[] = [
  ['src/maze/probe.ts', '../../vendor/mazefiles/README.md', true],
  ['src/maze/probe.ts', 'react', true],
  ['src/maze/probe.ts', 'node:fs', true],
  ['src/maze/named-probe.ts', '@phosphor-icons/react', true, 'named'],
  ['src/maze/lazy-probe.ts', '../library/mazefiles', true, 'dynamic'],
  ['src/maze/lazy-probe.ts', './walls', false, 'dynamic'],

  ['src/library/probe.ts', '@scripts/bundle-size', true],
  ['src/library/probe.ts', 'react-dom/client', true],
  ['src/library/named-probe.ts', '@phosphor-icons/react', true, 'named'],
  ['src/library/lazy-probe.ts', '../ui/app', true, 'dynamic'],

  ['src/render/probe.ts', '@tests/support/axe-check', true],
  ['src/render/probe.ts', 'react', true],
  ['src/render/named-probe.ts', '@phosphor-icons/react', true, 'named'],

  ['src/generator/probe.ts', '../../vendor/mazefiles/README.md', true],
  ['src/generator/probe.ts', 'react', true],
  ['src/generator/probe.ts', 'node:fs', true],
  ['src/generator/named-probe.ts', '@phosphor-icons/react', true, 'named'],
  ['src/generator/lazy-probe.ts', '../ui/app', true, 'dynamic'],
  ['src/generator/lazy-probe.ts', './racing', false, 'dynamic'],

  ['src/ui/probe.ts', 'react', false],
  ['src/ui/probe.ts', '../../tests/support/axe-check', true],
  ['src/ui/probe.ts', '@phosphor-icons/react', true],
  ['src/ui/named-probe.ts', '@phosphor-icons/core', true, 'named'],
  ['src/ui/named-probe.ts', '@/ui/icons', false, 'named'],
  ['src/ui/lazy-probe.ts', '@/render/svg', false, 'dynamic'],
  ['src/ui/lazy-probe.ts', '@/generator', false, 'dynamic'],

  ['src/main.tsx', 'react', false],
  ['src/main.tsx', '@tests/support/axe-check', true],
  ['src/main.tsx', '@phosphor-icons/react', true],

  ['scripts/probe.ts', 'node:fs', false],
  ['scripts/probe.ts', '../tests/support/axe-check', true],
  ['scripts/probe.ts', 'react', true],
];

const FENCES: readonly Fence[] = [...LAYER_FENCES, ...OTHER_FENCES];

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
