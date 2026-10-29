import { describe, expect, test } from 'vitest';

import { LEVELS, PRESETS, type Preset } from '@/generator';
import {
  fieldBlocked,
  fieldHint,
  fieldValues,
  isCustom,
  modeHint,
  modeOf,
  presetName,
  presetSettings,
  readField,
  ruleOn,
  rulesCount,
  setMode,
  setRule,
  setScoring,
  slowNotes,
  startingSettings,
  styleNote,
  summary,
  trapNote,
} from '@/ui/generator/settings-model';

function preset(id: string): Preset {
  const found = PRESETS.find((p) => p.id === id);

  if (found === undefined) {
    throw new Error(`no preset ${id}`);
  }

  return found;
}

const RECOMMENDED = preset('recommended');

function readFieldOk(...args: Parameters<typeof readField>) {
  const read = readField(...args);

  if (!read.ok) {
    throw new Error(read.error);
  }

  return read.settings;
}
const BASE = presetSettings(RECOMMENDED);

describe('the settings form', () => {
  test('starts from Recommended, or from the kept settings once they check', () => {
    expect(startingSettings(undefined)).toEqual({
      preset: RECOMMENDED,
      settings: BASE,
    });
    expect(startingSettings({ preset: 'uk', settings: { ...BASE, path: [40, 70] } })).toMatchObject(
      {
        preset: preset('uk'),
        settings: { path: [40, 70] },
      }
    );
    const sparse = setMode(
      setMode(readFieldOk(BASE, 'symmetric', ['0']), 'zigzag', 'none', RECOMMENDED),
      'trap',
      'none',
      RECOMMENDED
    );
    expect(startingSettings({ preset: 'recommended', settings: sparse }).settings).toEqual(sparse);
    expect(
      presetName(
        startingSettings({ preset: 'recommended', settings: sparse }).settings,
        RECOMMENDED
      )
    ).toBe('Custom (from Recommended)');
    const withoutPath = { ...BASE };
    Reflect.deleteProperty(withoutPath, 'path');
    expect(startingSettings({ preset: 'recommended', settings: withoutPath }).settings).toEqual(
      BASE
    );
    expect(startingSettings({ preset: 'gone', settings: { size: 17 } })).toEqual({
      preset: RECOMMENDED,
      settings: BASE,
    });
  });

  test('reads a range field, as a level when it is one, and refuses one that does not read', () => {
    const long = readField(BASE, 'straights', [...LEVELS[16].straights.high].map(String));
    expect(long).toMatchObject({ ok: true, settings: { straights: 'high' } });
    expect(readField(BASE, 'straights', ['3', '9'])).toMatchObject({
      ok: true,
      settings: { straights: [3, 9] },
    });
    expect(readField(BASE, 'path', ['90', '80'])).toEqual({
      ok: false,
      error: 'Whole numbers from 1 to 999, the first not above the second',
    });
    expect(readField(BASE, 'path', ['', '80']).ok).toBe(false);
    expect(readField(BASE, 'straights', ['3', '16']).ok).toBe(false);
    expect(readField(BASE, 'path', ['2.5', '80']).ok).toBe(false);
  });

  test('leaves a fine tuning value out while it holds the default, and keeps a share as a fraction', () => {
    const tuned = readField(BASE, 'deadEnds', ['3', '9']);
    expect(tuned).toMatchObject({ ok: true, settings: { deadEnds: [3, 9] } });

    if (!tuned.ok) {
      throw new Error('no settings');
    }

    const back = readField(tuned.settings, 'deadEnds', fieldValues(BASE, 'deadEnds').map(String));
    expect(back.ok && Object.hasOwn(back.settings, 'deadEnds')).toBe(false);
    expect(readField(BASE, 'westStart', ['25'])).toMatchObject({
      ok: true,
      settings: { westStart: 0.25 },
    });
    const none = readField(BASE, 'westStart', ['0']);
    expect(none.ok).toBe(true);
    expect(none.ok && Object.hasOwn(none.settings, 'westStart')).toBe(false);
  });

  test('sets the 3-state modes from Always, Mix and Don’t require', () => {
    expect(modeOf(BASE, 'zigzag')).toBe('mix');
    expect(setMode(BASE, 'zigzag', 'always', RECOMMENDED).zigzag).toBe(1);
    expect(Object.hasOwn(setMode(BASE, 'zigzag', 'none', RECOMMENDED), 'zigzag')).toBe(false);
    expect(setMode(BASE, 'choice', 'none', RECOMMENDED).choice).toBe(false);
    expect(
      setMode(setMode(BASE, 'choice', 'none', RECOMMENDED), 'choice', 'mix', RECOMMENDED).choice
    ).toBe(0.5);
    expect(setMode(BASE, 'trap', 'mix', RECOMMENDED)).toBe(BASE);
    expect(modeHint(setMode(BASE, 'zigzag', 'always', RECOMMENDED), 'zigzag')).toMatch(
      /^Every maze/
    );
    expect(modeHint(BASE, 'zigzag')).toBe(
      'In 12 % of the mazes: a slalom on the diagonal route (amber), the heading changing every cell even with diagonals'
    );
  });

  test('drops a switch that says what the default does, Never trivial among them', () => {
    expect(ruleOn(BASE, 'contest')).toBe(true);
    const trivial = setRule(BASE, 'contest', false);
    expect(trivial.contest).toBe(false);
    expect(Object.hasOwn(setRule(trivial, 'contest', true), 'contest')).toBe(false);
    expect(rulesCount(trivial)).toBe('4 of 5 on');
    expect(setRule(BASE, 'follower', false).follower).toBe(false);
    expect(
      Object.hasOwn(setRule(setRule(BASE, 'follower', false), 'follower', true), 'follower')
    ).toBe(false);
    expect(setRule(BASE, 'goal', true).goal).toBe(3);
    expect(Object.hasOwn(setRule(setRule(BASE, 'goal', true), 'goal', false), 'goal')).toBe(false);
    expect(Object.hasOwn(setScoring(setScoring(BASE, 'search'), 'best'), 'scoring')).toBe(false);
  });

  test('names the preset, or Custom once a field moved off it', () => {
    expect(isCustom(BASE, RECOMMENDED)).toBe(false);
    expect(summary(BASE, RECOMMENDED)).toBe('Recommended · 16 × 16, 60–100 cells');
    const moved = { ...BASE, path: [50, 90] as const };
    expect(presetName(moved, RECOMMENDED)).toBe('Custom (from Recommended)');
    expect(isCustom(presetSettings(RECOMMENDED, 32), RECOMMENDED)).toBe(false);
  });

  test('says which fields do not apply and warns of targets rarely met', () => {
    const noChoice = setMode(BASE, 'choice', 'none', RECOMMENDED);
    expect(fieldBlocked(noChoice, 'racingGain')).toBe(true);
    expect(fieldHint(noChoice, 'racingGain')).toEqual({
      text: 'Needs Route choice on Always or Mix',
      warning: false,
    });
    expect(fieldBlocked(BASE, 'room')).toBe(true);
    expect(fieldBlocked(BASE, 'choiceShare')).toBe(false);
    expect(slowNotes({ ...BASE, path: [5, 10] }).path).toBe(
      'No maze has a shortest path under about 20 cells: each one takes many seconds and comes out off target'
    );
    expect(fieldHint({ ...BASE, path: [5, 10] }, 'path').warning).toBe(true);
    expect(trapNote({ ...BASE, path: [200, 220] })).toMatch(/^No maze can get a search trap/);
    expect(styleNote(BASE)).toBeUndefined();
    expect(styleNote({ ...BASE, path: [150, 180] })).toMatch(/every maze comes out one way/);
  });
});
