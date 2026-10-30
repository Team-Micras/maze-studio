import { describe, expect, test } from 'vitest';

import { generate, PRESETS } from '@/generator';
import { GOLDEN } from '@tests/generator/golden';

describe('the generator in the browser', () => {
  test.each(PRESETS.map((p) => [p.id, p] as const))('locks seed to walls on %s', (id, preset) => {
    const hashes = GOLDEN.hashes[id] ?? [];
    expect(hashes.map((_, k) => generate(preset.settings, k + 1).recipe.hash)).toEqual(hashes);
  });
});
