/**
 * Generates the same seeds with the generator's mockup, plain JavaScript in the Micras workspace,
 * and with `src/generator`, and checks that both build the same walls, goals, hash, style and
 * energy, pick the same varied batch and make the same variations. Prints the median and p95 time
 * of a maze per preset for both. It is a tool, outside `bun run check`, as the mockup lives outside
 * this repository:
 *
 * ```sh
 * bun tests/generator/mockup-cross-check.ts [mockup assets] [seeds per 16 × 16 preset] [seeds half size]
 * ```
 *
 * The mockup's assets default to `../docs/maze-editor/mockups/generator/assets` beside this
 * repository; the counts to 20 and 5. It exits with 1 on the first difference.
 *
 * @module
 */

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { generate, pickDiverse, PRESETS, vary, type Candidate, type Settings } from '@/generator';

interface MockupCandidate {
  readonly seed: number;
  readonly style: string;
  readonly energy: number;
  readonly recipe: { readonly hash: string };
  readonly grid: { readonly walls: Uint8Array; readonly goals: readonly number[] };
}

interface Mockup {
  readonly generate: (settings: Settings, seed: number) => MockupCandidate;
  readonly vary: (
    settings: Settings,
    seed: number,
    base: ArrayLike<number>,
    strength: number
  ) => MockupCandidate;
  readonly pickDiverse: (candidates: readonly MockupCandidate[], n: number) => MockupCandidate[];
}

const [assets, perPreset, perHalf] = [
  process.argv[2] ??
    join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'docs',
      'maze-editor',
      'mockups',
      'generator',
      'assets'
    ),
  Number(process.argv[3] ?? 20),
  Number(process.argv[4] ?? 5),
];

const load = async (file: string): Promise<unknown> =>
  import(pathToFileURL(join(assets, file)).href);

const has = (module: unknown, ...names: string[]) =>
  typeof module === 'object' && module !== null && names.every((name) => name in module);

const isGenerator = (module: unknown): module is Pick<Mockup, 'generate' | 'vary'> =>
  has(module, 'generate', 'vary');

const isDiversity = (module: unknown): module is Pick<Mockup, 'pickDiverse'> =>
  has(module, 'pickDiverse');

const generatorModule = await load('generator.js');
const diversityModule = await load('diversity.js');
if (!isGenerator(generatorModule) || !isDiversity(diversityModule)) {
  throw new Error(`no mockup generator in ${assets}`);
}
const mockup: Mockup = {
  generate: generatorModule.generate,
  vary: generatorModule.vary,
  pickDiverse: diversityModule.pickDiverse,
};

/** The time `make` takes and what it made. */
function timed<T>(make: () => T): { value: T; ms: number } {
  const t0 = performance.now();
  const value = make();
  return { value, ms: performance.now() - t0 };
}

const quantile = (values: readonly number[], q: number) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
};

const ms = (v: number) => `${Math.round(v)}`.padStart(5);

/** The differences between a maze of the mockup and one of the port, empty when they agree. */
function differences(m: MockupCandidate, p: Candidate): string[] {
  const out: string[] = [];
  if (
    m.grid.walls.length !== p.grid.walls.length ||
    m.grid.walls.some((w, i) => w !== p.grid.walls[i])
  ) {
    out.push('walls');
  }
  if (m.grid.goals.join() !== p.grid.goals.join()) {
    out.push('goals');
  }
  if (m.recipe.hash !== p.recipe.hash) {
    out.push(`hash ${m.recipe.hash} ≠ ${p.recipe.hash ?? '?'}`);
  }
  if (m.style !== p.style) {
    out.push(`style ${m.style} ≠ ${p.style}`);
  }
  if (!Object.is(m.energy, p.energy)) {
    out.push(`energy ${m.energy} ≠ ${p.energy}`);
  }
  return out;
}

function fail(what: string): never {
  console.error(`DIFFERENT ${what}`);
  process.exit(1);
}

let compared = 0;
for (const preset of PRESETS) {
  const count = preset.settings.size === 32 ? perHalf : perPreset;
  const times = { mockup: [] as number[], port: [] as number[] };
  const made = { mockup: [] as MockupCandidate[], port: [] as Candidate[] };
  for (let seed = 1; seed <= count; seed++) {
    const m = timed(() => mockup.generate(preset.settings, seed));
    const p = timed(() => generate(preset.settings, seed));
    times.mockup.push(m.ms);
    times.port.push(p.ms);
    made.mockup.push(m.value);
    made.port.push(p.value);
    const wrong = differences(m.value, p.value);
    if (wrong.length) {
      fail(`${preset.id} seed ${seed}: ${wrong.join(', ')}`);
    }
    compared++;
  }
  const n = Math.min(8, count);
  const picked = {
    mockup: mockup.pickDiverse(made.mockup, n).map((c) => c.seed),
    port: pickDiverse(made.port, n).map((c) => c.seed),
  };
  if (picked.mockup.join() !== picked.port.join()) {
    fail(`${preset.id} batch: ${picked.mockup.join()} ≠ ${picked.port.join()}`);
  }
  const base = made.port[0]?.grid.walls;
  const varied = preset.settings.size === 16 && base ? [11, 12] : [];
  for (const seed of varied) {
    const m = mockup.vary(preset.settings, seed, base ?? [], 0.3);
    const p = vary(preset.settings, seed, base ?? [], 0.3);
    const wrong = differences(m, p);
    if (wrong.length) {
      fail(`${preset.id} variation ${seed}: ${wrong.join(', ')}`);
    }
  }
  console.log(
    `same ${preset.id.padEnd(11)} ${String(count).padStart(2)} seeds, batch of ${n}, ${varied.length} variations` +
      `   median ms mockup ${ms(quantile(times.mockup, 0.5))} port ${ms(quantile(times.port, 0.5))}` +
      `   p95 ms mockup ${ms(quantile(times.mockup, 0.95))} port ${ms(quantile(times.port, 0.95))}`
  );
}
console.log(`${compared} mazes built the same by the mockup and the port`);
