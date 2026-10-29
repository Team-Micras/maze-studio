import { describe, expect, test } from 'vitest';

import { generate, PRESETS, report, type Analysis, type Targets } from '@/generator';
import { missedTargets, offTarget } from '@/ui/generator/misses';

const [RECOMMENDED] = PRESETS;

if (RECOMMENDED === undefined) {
  throw new Error('the generator has no preset');
}

const { analysis, targets, energy } = generate(RECOMMENDED.settings, 1);

describe('What an off-target maze missed', () => {
  test('is nothing for a maze within every target', () => {
    expect(energy).toBe(0);
    expect(missedTargets(analysis, targets)).toEqual([]);
  });

  test('names each target missed with what the maze has and what was asked', () => {
    const levels = targets.levelsOn === 'racing' ? analysis.choice?.racingShape : analysis;
    const straight = levels?.maxStraight ?? 0;
    const asked: Targets = {
      ...targets,
      straight: [straight + 1, straight + 5],
      loops: [analysis.loops + 10, analysis.loops + 20],
      motifs: { fishbone: [3, 7] },
      contest: true,
    };
    const measured: Analysis = {
      ...analysis,
      sensor: analysis.sensor && { ...analysis.sensor, fishbone: 0 },
      contest: false,
    };

    expect(missedTargets(measured, asked)).toEqual(
      expect.arrayContaining([
        `longest straight ${straight} (asked ${straight + 1}–${straight + 5})`,
        `${analysis.loops} loops (asked ${analysis.loops + 10}–${analysis.loops + 20})`,
        'no fishbone corridor',
        'trivial: no decision matters',
      ])
    );
    expect(report(measured, asked)).toMatchObject({ straight: false, loops: false, board: false });
  });

  test('says a search trap is asked from its least loss up, and counts one route as one', () => {
    const asked: Targets = { ...targets, trap: [40, Number.POSITIVE_INFINITY], ties: 2 };
    const measured: Analysis = { ...analysis, trap: 12, ties: 1 };

    expect(missedTargets(measured, asked)).toEqual(
      expect.arrayContaining([
        'search trap 12 % (asked 40 % or more)',
        '1 near-tied route (asked 2 or more)',
      ])
    );
  });

  test('reads as one line, Off target first', () => {
    expect(offTarget(['no fishbone corridor', 'longest straight 9 (asked 10–15)'])).toBe(
      'Off target: no fishbone corridor, longest straight 9 (asked 10–15)'
    );
    expect(offTarget([])).toBe('Off target');
    const short: Analysis = {
      ...analysis,
      sensor: analysis.sensor && { ...analysis.sensor, fishbone: 1 },
    };
    expect(missedTargets(short, { ...targets, motifs: { fishbone: [3, 7] } })).toContain(
      'fishbone corridor 1 cell (asked 3–7)'
    );
    expect(offTarget(undefined)).toBe('Off target');
  });
});
