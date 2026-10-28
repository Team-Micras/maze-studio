import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, test } from 'vitest';

import {
  analyse,
  energy,
  generate,
  GENERATOR_VERSION,
  pickDiverse,
  PRESETS,
  report,
  routeChoice,
  STYLES,
  stylesFor,
  trapReach,
  vary,
  wallHash,
  type Candidate,
  type Grid,
  type Range,
  type Settings,
} from '@/generator';
import { expOf, logOf } from '@/generator/generator';
import { isOpen, neighbour } from '@/generator/grid';
import { followerReaches } from '@/generator/search';

const GENERATOR = join(import.meta.dirname, '..', '..', 'src', 'generator');

/**
 * Seed to walls at this generator version, the hashes of the mockup the generator was ported
 * from. A change that moves one bumps `GENERATOR_VERSION` and records new hashes beside these,
 * never over them.
 */
const GOLDEN: { readonly version: number; readonly hashes: Record<string, readonly string[]> } = {
  version: 7,
  hashes: {
    recommended: ['0d1689f7', '8abe0a3b', '226953ce'],
    japan: ['56637c02', '08b42645', '130a203e'],
    'japan-half': ['cf2e04d1', '6edb60b7'],
    apec: ['777aeb39', '6168ca7c', '2da70780'],
    uk: ['4c3c097b', 'cfae0b19', '4e5ebf18'],
    single: ['bb7acde6', '7b099120', '78dab16b'],
  },
};

const within = (v: number, [lo, hi]: Range) => v >= lo && v <= hi;

/** The hard rules a candidate keeps whatever its energy. */
function expectHardRules({ grid: g, analysis, style }: Candidate, s: Settings): void {
  const a = analyse(g);
  const goal = new Set(g.goals);

  expect([...STYLES, 'variation']).toContain(style);
  expect(analysis.style).toBe(style);
  expect(a.unreachable).toBe(g.closed ?? 0);
  expect(isOpen(g, 0, 0) && !isOpen(g, 0, 1)).toBe(true);
  expect(analysis.shortest).toBe(a.shortest);

  const doors = g.goals.flatMap((c) =>
    [0, 1, 2, 3].filter((d) => isOpen(g, c, d) && !goal.has(neighbour(g, c, d)))
  );
  expect(s.oneEntry ? doors.length : 1).toBe(1);
  expect((s.follower ?? s.competition) && followerReaches(g)).toBe(false);
  expect(s.competition ? barePosts(g, a.dist) : []).toEqual([]);
}

/** The posts with no wall, but inside the goal and among cells that do not reach it. */
function barePosts(g: Grid, dist: Int32Array): string[] {
  const goal = new Set(g.goals);
  const bare: string[] = [];
  for (let py = 1; py < g.height; py++) {
    for (let px = 1; px < g.width; px++) {
      const sw = (py - 1) * g.width + px - 1;
      const ne = py * g.width + px;
      const around = [sw, sw + 1, ne, ne - 1];
      if (around.every((c) => goal.has(c)) || around.every((c) => dist[c] < 0)) {
        continue;
      }
      if (isOpen(g, sw, 0) && isOpen(g, sw, 1) && isOpen(g, ne, 2) && isOpen(g, ne, 3)) {
        bare.push(`(${px}, ${py})`);
      }
    }
  }
  return bare;
}

/** What an energy of 0 promises of a candidate's path, levels, loops and texture. */
function expectMetWhenZero({ grid: g, energy: e, targets: t }: Candidate): void {
  const a = analyse(g);
  const levels = t.levelsOn === 'racing' ? routeChoice(g)?.racingShape : a;
  const met = {
    path: within(a.shortest, t.path),
    loops: within(a.loops, t.loops),
    straight: Boolean(levels && within(levels.maxStraight, t.straight)),
    diagonal: Boolean(levels && within(levels.maxDiagonal, t.diagonal)),
    texture: within(a.deadEnds, t.deadEnds) && within(a.corridors, t.corridors),
  };
  const all = { path: true, loops: true, straight: true, diagonal: true, texture: true };
  expect(e === 0 ? met : all).toEqual(all);
}

const golden = new Map<string, Candidate[]>();

beforeAll(() => {
  for (const preset of PRESETS) {
    golden.set(
      preset.id,
      (GOLDEN.hashes[preset.id] ?? []).map((_, k) => generate(preset.settings, k + 1))
    );
  }
}, 120_000);

describe('the generator', () => {
  test('is the version the golden hashes belong to', () => {
    expect(GENERATOR_VERSION).toBe(GOLDEN.version);
    expect(Object.keys(GOLDEN.hashes).toSorted()).toEqual(PRESETS.map((p) => p.id).toSorted());
  });

  test.each(PRESETS.map((p) => [p.id, p] as const))('locks seed to walls on %s', (id, preset) => {
    const made = golden.get(id) ?? [];
    expect(made.map((c) => c.recipe.hash)).toEqual(GOLDEN.hashes[id]);
    for (const c of made) {
      expect(c.recipe).toMatchObject({
        version: GENERATOR_VERSION,
        settings: preset.settings,
        seed: c.seed,
        hash: wallHash(c.grid),
      });
    }
  });

  test.each(PRESETS.map((p) => [p.id, p] as const))('keeps the hard rules on %s', (id, preset) => {
    for (const c of golden.get(id) ?? []) {
      expectHardRules(c, preset.settings);
      expectMetWhenZero(c);
      expect(energy(c.analysis, c.targets)).toBe(c.energy);
      expect(c.energy === 0).toBe(
        Object.values(report(c.analysis, c.targets)).every((v) => v !== false)
      );
    }
  });

  test('rebuilds a maze from its recipe', () => {
    for (const preset of PRESETS) {
      const [first] = golden.get(preset.id) ?? [];
      expect(generate(first.recipe.settings, first.recipe.seed).grid.walls).toEqual(
        first.grid.walls
      );
    }
  }, 60_000);

  test('shows each route it draws to the trace and builds the same walls', () => {
    const [first] = golden.get('recommended') ?? [];
    const candidates: Readonly<Record<string, unknown>>[] = [];
    const traced = generate(first.recipe.settings, first.recipe.seed, {
      trace: (stage, _walls, info) => {
        if (stage === 'candidate' && info) {
          candidates.push(info);
        }
      },
    });
    expect(traced.grid.walls).toEqual(first.grid.walls);
    expect(traced.recipe).toEqual(first.recipe);
    expect(traced.energy).toBe(first.energy);
    expect(traced.analysis).toEqual(first.analysis);
    expect(candidates.length).toBeGreaterThan(0);
    for (const { route, kind } of candidates) {
      expect(Array.isArray(route)).toBe(true);
      expect(['racing', 'careful']).toContain(kind);
    }
  });

  test('builds other walls from other seeds', () => {
    const [one, two] = golden.get('recommended') ?? [];
    expect(one.grid.walls).not.toEqual(two.grid.walls);
  });

  test('varies a maze inside its windows and rebuilds the variation from its recipe', () => {
    const recommended = PRESETS[0].settings;
    const [liked] = golden.get('recommended') ?? [];
    const v = vary(recommended, 11, liked.grid.walls, 0.2);
    expectHardRules(v, recommended);
    expect(v.grid.walls).not.toEqual(liked.grid.walls);
    expect(Math.abs(v.analysis.shortest - liked.analysis.shortest)).toBeLessThanOrEqual(4);
    const { settings, seed, base, strength, goals } = v.recipe;
    expect(vary(settings, seed, base ?? [], strength, {}, goals).grid.walls).toEqual(v.grid.walls);
  }, 60_000);

  test('refuses to vary a maze whose cells cannot all reach the goal', () => {
    const walls = new Uint8Array(256).fill(15);
    expect(() => vary(PRESETS[0].settings, 1, walls)).toThrow('every cell');
  });

  test('draws the styles the settings allow', () => {
    const recommended = PRESETS[0].settings;
    const choice = ['split', 'lane', 'stairs', 'late', 'crossing'];
    expect(stylesFor({ ...recommended, choice: true, trap: false })).toEqual(choice);
    expect(stylesFor({ ...recommended, choice: true, trap: true })).toEqual(choice);
    expect(stylesFor({ ...recommended, choice: false, trap: false })).toEqual(['tie', 'annealed']);
    const alone = { ...recommended, choice: false, trap: true };
    expect(stylesFor(alone)).toEqual(['bait']);
    expect(trapReach(alone)).toBe(71);
    expect(stylesFor(alone, trapReach(alone) + 1)).toEqual(['tie', 'annealed']);
    expect(stylesFor({ ...recommended, path: [130, 150] })).toEqual(['annealed']);
  });

  test('picks a varied batch whatever order the candidates arrive in', () => {
    const all = [...golden.values()].flat().map((c, k) => ({
      grid: c.grid,
      analysis: c.analysis,
      energy: c.energy,
      style: c.style,
      seed: 100 + k,
    }));
    const batch = pickDiverse(all, 8);
    expect(batch).toHaveLength(8);
    expect(pickDiverse(all.toReversed(), 8)).toEqual(batch);
    expect(new Set(batch.map((c) => c.style)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('the arithmetic of the generator', () => {
  test('takes e^x and ln x from + - × / alone, to the last digits', () => {
    for (let x = -4; x <= 0; x += 0.0625) {
      expect(Math.abs(expOf(x) / Math.exp(x) - 1)).toBeLessThan(1e-14);
    }
    for (const x of [1e-9, 0.001, 0.02, 0.3, 0.5, 0.999999, 1, 7.5]) {
      expect(Math.abs(logOf(x) - Math.log(x))).toBeLessThan(
        1e-13 * Math.max(1, Math.abs(Math.log(x)))
      );
    }
    expect(logOf(0)).toBe(-Infinity);
    expect(expOf(-Infinity)).toBe(0);
  });

  test('uses no Math function that engines round differently', () => {
    const files = readdirSync(GENERATOR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10);
    const approximated =
      /Math\.(pow|exp|expm1|log|log2|log10|log1p|hypot|atan2?|asin|acos|sinh?|cosh?|tanh?|cbrt)\b|\*\*/;
    const offenders = files.filter((file) =>
      approximated.test(
        readFileSync(join(GENERATOR, file), 'utf8').replaceAll(/\/\*\*[\s\S]*?\*\//g, '')
      )
    );
    expect(offenders).toEqual([]);
  });
});
