/**
 * The generator settings form, without React (the mockup's `settings-form.js`): the preset, the
 * board size, the number fields and their bounds, the Always / Mix / Don't require modes of the
 * route choice, the search traps and the sensor motifs, the rules, the scoring, and the notes and
 * hints the form shows. Every change returns new settings kept in the form that rebuilds the same
 * maze: a straight or diagonal range equal to a level is the level, a fine tuning value equal to
 * the generator's default is left out.
 *
 * @module
 */

import {
  CHOICE,
  choiceShare,
  isSettings,
  LEVELS,
  levelRange,
  MOTIF_CELLS,
  MOTIFS,
  PRESETS,
  resize,
  share,
  stylesFor,
  TEXT,
  TEXTURE,
  TIES,
  TRAP,
  trapReach,
  trapShare,
  type Level,
  type Motif,
  type Preset,
  type Range,
  type Settings,
  type Style,
} from '@/generator';

/** How often the mazes of a batch must have a feature: every one, some, or none required. */
export type Mode = 'always' | 'mix' | 'none';

/** What a mode sets: the route choice, the search traps or a sensor motif. */
export type ModeKey = 'choice' | 'trap' | Motif;

/** The switches of the form. */
export type RuleKey = 'competition' | 'follower' | 'oneEntry' | 'loopsRequired' | 'contest';

/** The number fields that take a range, from–to. */
export type PairKey =
  | 'path'
  | 'straights'
  | 'diagonals'
  | 'loops'
  | 'deadEnds'
  | 'corridors'
  | 'racingGain'
  | 'carefulLoss'
  | 'zigzagCells'
  | 'dashedCells'
  | 'fishboneCells';

/** The number fields that take one number. */
export type SingleKey =
  | 'trapLoss'
  | 'choiceShare'
  | 'trapShare'
  | 'ties'
  | 'symmetric'
  | 'westStart'
  | 'twoDoors'
  | 'room';

/** Any number field. */
export type FieldKey = PairKey | SingleKey;

/** What a field needs switched on (or, with `!`, off) before it applies. */
type Need = ModeKey | 'choiceMix' | 'trapMix' | '!oneEntry' | 'half';

/** The modes, in the order the form shows them. */
export const MODES: readonly Mode[] = ['always', 'mix', 'none'];

/** The route choice and the search traps, under Rules. */
export const RULE_MODES: readonly ModeKey[] = ['choice', 'trap'];

/** The sensor motifs, on the form itself. */
export const MOTIF_MODES: readonly ModeKey[] = MOTIFS;

/** The switches under Rules, in order. */
export const RULES: readonly RuleKey[] = [
  'competition',
  'follower',
  'oneEntry',
  'loopsRequired',
  'contest',
];

/** The levels of the longest straight and diagonal. */
export const LEVEL_KEYS: readonly Level[] = ['low', 'medium', 'high'];

/** The scorings. */
export const SCORINGS = ['best', 'search'] as const;

/** A scoring. */
export type Scoring = (typeof SCORINGS)[number];

/** The fields under Fine tuning, in order; `goal` is the switch of the 3 × 3 goal among them. */
export const TUNING_FIELDS: readonly (FieldKey | 'goal')[] = [
  'loops',
  'deadEnds',
  'corridors',
  'racingGain',
  'carefulLoss',
  'trapLoss',
  'choiceShare',
  'trapShare',
  'ties',
  'symmetric',
  'westStart',
  'twoDoors',
  'goal',
  'room',
  'zigzagCells',
  'dashedCells',
  'fishboneCells',
];

/** The pair fields among {@link FieldKey}. */
export const PAIRS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  'path',
  'straights',
  'diagonals',
  'loops',
  'deadEnds',
  'corridors',
  'racingGain',
  'carefulLoss',
  'zigzagCells',
  'dashedCells',
  'fishboneCells',
]);

/** Share of the mazes "Mix" asks for when the preset holds no share of its own. */
const MIX: Readonly<Record<ModeKey, number>> = {
  choice: 0.5,
  trap: TRAP.share,
  zigzag: 0.1,
  dashed: 0.1,
  fishbone: 0.1,
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function omit(s: Settings, key: keyof Settings): Settings {
  const next = { ...s };
  Reflect.deleteProperty(next, key);
  return next;
}

function withValue<K extends keyof Settings>(s: Settings, key: K, value: Settings[K]): Settings {
  return { ...s, [key]: value };
}

const pct = (v: boolean | number | undefined): number => Math.round(100 * share(v, 1));

const pairOf = (values: readonly number[]): Range => [values[0] ?? 0, values[1] ?? 0];

/** The mode of the route choice, the search traps or a sensor motif, from its share. */
export function modeOf(s: Settings, key: ModeKey): Mode {
  const value =
    key === 'choice' ? choiceShare(s) : key === 'trap' ? trapShare(s) : share(s[key], 1);
  return value >= 1 ? 'always' : value <= 0 ? 'none' : 'mix';
}

const NEEDS: Readonly<Record<Need, (s: Settings) => boolean>> = {
  choice: (s) => choiceShare(s) > 0,
  trap: (s) => trapShare(s) > 0,
  zigzag: (s) => share(s.zigzag, 1) > 0,
  dashed: (s) => share(s.dashed, 1) > 0,
  fishbone: (s) => share(s.fishbone, 1) > 0,
  choiceMix: (s) => modeOf(s, 'choice') === 'mix',
  trapMix: (s) => modeOf(s, 'trap') === 'mix',
  '!oneEntry': (s) => !s.oneEntry,
  half: (s) => s.size === 32,
};

const tunedPair =
  (key: 'deadEnds' | 'corridors' | 'racingGain' | 'carefulLoss' | `${Motif}Cells`) =>
  (standard: (s: Settings) => Range) =>
  (s: Settings, values: readonly number[]): Settings =>
    same(pairOf(values), standard(s)) ? omit(s, key) : withValue(s, key, pairOf(values));

const levelPair =
  (key: 'straights' | 'diagonals') =>
  (s: Settings, values: readonly number[]): Settings =>
    withValue(
      s,
      key,
      LEVEL_KEYS.find((level) => same(LEVELS[s.size][key][level], pairOf(values))) ?? pairOf(values)
    );

const percent =
  (key: 'symmetric' | 'westStart' | 'twoDoors' | 'room') =>
  (s: Settings, [v = 0]: readonly number[]): Settings =>
    v === 0 ? omit(s, key) : withValue(s, key, v / 100);

const standardTies = (s: Settings): number => TIES[s.size] + (s.scoring === 'search' ? 1 : 0);

interface Field {
  readonly get: (s: Settings) => Range | number;
  readonly min: number;
  readonly max: (s: Settings) => number;
  readonly needs?: Need;
  readonly set: (s: Settings, values: readonly number[]) => Settings;
}

const FIELDS: Readonly<Record<FieldKey, Field>> = {
  path: { get: (s) => s.path, min: 1, max: () => 999, set: (s, v) => ({ ...s, path: pairOf(v) }) },
  straights: {
    get: (s) => levelRange(s, 'straights'),
    min: 1,
    max: (s) => s.size - 1,
    set: levelPair('straights'),
  },
  diagonals: {
    get: (s) => levelRange(s, 'diagonals'),
    min: 0,
    max: (s) => 3 * s.size,
    set: levelPair('diagonals'),
  },
  loops: {
    get: (s) => s.loops,
    min: 0,
    max: () => 999,
    set: (s, v) => ({ ...s, loops: pairOf(v) }),
  },
  deadEnds: {
    get: (s) => s.deadEnds ?? TEXTURE[s.size].deadEnds,
    min: 0,
    max: () => 100,
    set: tunedPair('deadEnds')((s) => TEXTURE[s.size].deadEnds),
  },
  corridors: {
    get: (s) => s.corridors ?? TEXTURE[s.size].corridors,
    min: 0,
    max: () => 100,
    set: tunedPair('corridors')((s) => TEXTURE[s.size].corridors),
  },
  racingGain: {
    get: (s) => s.racingGain ?? CHOICE.gain,
    min: 0,
    max: () => 100,
    needs: 'choice',
    set: tunedPair('racingGain')(() => CHOICE.gain),
  },
  carefulLoss: {
    get: (s) => s.carefulLoss ?? CHOICE.loss,
    min: 0,
    max: () => 100,
    needs: 'choice',
    set: tunedPair('carefulLoss')(() => CHOICE.loss),
  },
  trapLoss: {
    get: (s) => s.trapLoss ?? TRAP.loss,
    min: 1,
    max: () => 100,
    needs: 'trap',
    set: (s, [v = TRAP.loss]) => (v === TRAP.loss ? omit(s, 'trapLoss') : { ...s, trapLoss: v }),
  },
  choiceShare: {
    get: (s) => Math.round(100 * choiceShare(s)),
    min: 1,
    max: () => 99,
    needs: 'choiceMix',
    set: (s, [v = 0]) => ({ ...s, choice: v / 100 }),
  },
  trapShare: {
    get: (s) => Math.round(100 * trapShare(s)),
    min: 1,
    max: () => 99,
    needs: 'trapMix',
    set: (s, [v = 0]) => ({ ...s, trap: v / 100 }),
  },
  ties: {
    get: (s) => s.ties ?? standardTies(s),
    min: 0,
    max: () => 20,
    set: (s, [v = 0]) => (v === standardTies(s) ? omit(s, 'ties') : { ...s, ties: v }),
  },
  symmetric: {
    get: (s) => Math.round(100 * (s.symmetric ?? 0)),
    min: 0,
    max: () => 100,
    set: percent('symmetric'),
  },
  westStart: {
    get: (s) => Math.round(100 * (s.westStart ?? 0)),
    min: 0,
    max: () => 100,
    set: percent('westStart'),
  },
  twoDoors: {
    get: (s) => Math.round(100 * (s.twoDoors ?? 0)),
    min: 0,
    max: () => 100,
    needs: '!oneEntry',
    set: percent('twoDoors'),
  },
  room: {
    get: (s) => Math.round(100 * (s.room ?? 0)),
    min: 0,
    max: () => 30,
    needs: 'half',
    set: percent('room'),
  },
  zigzagCells: {
    get: (s) => s.zigzagCells ?? MOTIF_CELLS[s.size].zigzag,
    min: 4,
    max: (s) => 2 * s.size,
    needs: 'zigzag',
    set: tunedPair('zigzagCells')((s) => MOTIF_CELLS[s.size].zigzag),
  },
  dashedCells: {
    get: (s) => s.dashedCells ?? MOTIF_CELLS[s.size].dashed,
    min: 4,
    max: (s) => s.size - 4,
    needs: 'dashed',
    set: tunedPair('dashedCells')((s) => MOTIF_CELLS[s.size].dashed),
  },
  fishboneCells: {
    get: (s) => s.fishboneCells ?? MOTIF_CELLS[s.size].fishbone,
    min: 3,
    max: (s) => s.size - 2,
    needs: 'fishbone',
    set: tunedPair('fishboneCells')((s) => MOTIF_CELLS[s.size].fishbone),
  },
};

/** The values a field shows: two for a range, one for a single number. */
export function fieldValues(s: Settings, key: FieldKey): readonly number[] {
  return [FIELDS[key].get(s)].flat();
}

/** The bounds of a field on these settings. */
export function fieldBounds(s: Settings, key: FieldKey): Range {
  return [FIELDS[key].min, FIELDS[key].max(s)];
}

/** Whether a field does not apply, as the switch it needs is not set. */
export function fieldBlocked(s: Settings, key: FieldKey): boolean {
  const { needs } = FIELDS[key];
  return needs !== undefined && !NEEDS[needs](s);
}

/** What reading a field's inputs gives: the new settings, or the error to show. */
export type FieldRead =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly error: string };

/**
 * The settings with a field read from the text of its inputs: whole numbers within its bounds,
 * the first not above the second.
 */
export function readField(s: Settings, key: FieldKey, texts: readonly string[]): FieldRead {
  const [min, max] = fieldBounds(s, key);
  const values = texts.map((text) => (text.trim() === '' ? Number.NaN : Number(text)));
  const ok =
    values.every((v) => Number.isInteger(v) && v >= min && v <= max) &&
    (values.length < 2 || (values[0] ?? 0) <= (values[1] ?? 0));
  return ok
    ? { ok: true, settings: FIELDS[key].set(s, values) }
    : { ok: false, error: COPY.rangeError(min, max) };
}

/** Whether a switch is on. */
export function ruleOn(s: Settings, key: RuleKey | 'goal'): boolean {
  switch (key) {
    case 'follower':
      return s.follower ?? s.competition;
    case 'contest':
      return s.contest !== false;
    case 'goal':
      return s.goal === 3;
    default:
      return s[key];
  }
}

/**
 * The settings with a switch set; the wall follower rule, the goal block and Never trivial drop
 * out when they say what the default does.
 */
export function setRule(s: Settings, key: RuleKey | 'goal', on: boolean): Settings {
  const next =
    key === 'goal'
      ? on
        ? { ...s, goal: 3 as const }
        : omit(s, 'goal')
      : key === 'contest' && on
        ? omit(s, 'contest')
        : withValue(s, key, on);
  return next.follower === next.competition ? omit(next, 'follower') : next;
}

/**
 * The settings with the route choice, the search traps or a sensor motif set to a mode: always 1,
 * none `false` (a motif left out), mix the preset's share or {@link MIX}, a share already mixed
 * staying as it is.
 */
export function setMode(s: Settings, key: ModeKey, mode: Mode, preset: Preset): Settings {
  if (mode === 'mix' && modeOf(s, key) === 'mix') {
    return s;
  }

  const own = preset.settings[key];
  const mixed = typeof own === 'number' && own > 0 && own < 1 ? own : MIX[key];

  if (mode === 'none' && key !== 'choice' && key !== 'trap') {
    return omit(s, key);
  }

  return withValue(s, key, mode === 'always' ? 1 : mode === 'none' ? false : mixed);
}

/** The settings with a level of the longest straight or diagonal. */
export function setLevel(s: Settings, key: 'straights' | 'diagonals', level: Level): Settings {
  return withValue(s, key, level);
}

/** The level a range of the longest straight or diagonal is, if it is one. */
export function levelOf(s: Settings, key: 'straights' | 'diagonals'): Level | undefined {
  const v = s[key];
  return typeof v === 'string' ? v : undefined;
}

/** The scoring of the settings. */
export function scoringOf(s: Settings): Scoring {
  return s.scoring ?? 'best';
}

/** The settings with a scoring, left out for the default. */
export function setScoring(s: Settings, scoring: Scoring): Settings {
  return scoring === 'best' ? omit(s, 'scoring') : { ...s, scoring };
}

/** The settings of a preset, for a board of `size` when given. */
export function presetSettings(preset: Preset, size?: 16 | 32): Settings {
  return structuredClone(size === undefined ? preset.settings : resize(preset.settings, size));
}

/** Whether the settings differ from their preset's on the same board. */
export function isCustom(s: Settings, preset: Preset): boolean {
  const standard = resize(preset.settings, s.size);
  const keys = new Set([...Object.keys(s), ...Object.keys(standard)]);
  return [...keys].some((k) => !same(Reflect.get(s, k), Reflect.get(standard, k)));
}

/** The name of the preset, or "Custom (from …)" once a field moved off it. */
export function presetName(s: Settings, preset: Preset): string {
  return isCustom(s, preset) ? COPY.custom(preset.label) : preset.label;
}

/**
 * The settings and preset the form starts from: those kept, as kept once they check (a field left
 * out at its default stays out), filled from Recommended's when they lack a field, or Recommended's.
 */
export function startingSettings(
  saved: { readonly preset: string; readonly settings: object } | undefined
): {
  readonly preset: Preset;
  readonly settings: Settings;
} {
  const [first] = PRESETS;

  if (first === undefined) {
    throw new Error('the generator has no preset');
  }

  const preset = PRESETS.find((p) => p.id === saved?.preset) ?? first;
  const own: unknown = saved?.settings;
  const merged: unknown = { ...first.settings, ...saved?.settings };
  return {
    preset,
    settings:
      saved !== undefined && isSettings(own)
        ? own
        : saved !== undefined && isSettings(merged)
          ? merged
          : presetSettings(preset),
  };
}

/** The line under the Settings heading: preset, board and path. */
export function summary(s: Settings, preset: Preset): string {
  return `${presetName(s, preset)} · ${s.size} × ${s.size}, ${s.path[0]}–${s.path[1]} cells`;
}

/** How many of the switches under Rules are on, as its heading says. */
export function rulesCount(s: Settings): string {
  const on = RULES.filter((key) => ruleOn(s, key)).length;
  return on === RULES.length ? 'all on' : `${on} of ${RULES.length} on`;
}

/** The hint under a mode, for the mode the settings have. */
export function modeHint(s: Settings, key: ModeKey): string {
  const mode = modeOf(s, key);
  const hint = COPY.modeHint[key][mode];
  return typeof hint === 'function' ? hint(s) : hint;
}

/** The hint under a switch. */
export function ruleHint(s: Settings, key: RuleKey | 'goal'): string {
  return key === 'loopsRequired'
    ? COPY.loopsHint(s.loopsRequired ? s.loops : [0, s.loops[1]], s.loopsRequired)
    : COPY.rules[key][1];
}

/**
 * Highest least diagonal, in moves, most seeds still reach on a board: 17 on 16 × 16, scaled with
 * the board side.
 */
const diagonalReach = (size: 16 | 32): number => Math.round((17 * (size - 1)) / 15);

/** Bounds past which the generator rarely meets a target and each maze takes seconds. */
const reach = (size: 16 | 32) =>
  ({
    path: [size + 4, Math.round(0.77 * size * size)],
    loops: (size * size) / 8,
    deadEnds: [2, 20],
    corridors: [20, 65],
    gain: 25,
    loss: [1, 25],
    trap: 40,
  }) as const;

const outside = ([lo, hi]: Range, [a, b]: Range): boolean => hi < a || lo > b;

const asRange = (v: Range | number): Range => (typeof v === 'number' ? [v, v] : v);

/** The warnings of targets the generator rarely meets, by field. */
export function slowNotes(s: Settings): Partial<Record<FieldKey, string>> {
  const r = reach(s.size);
  const out: Partial<Record<FieldKey, string>> = {};
  const [diagonalLow, diagonalHigh] = levelRange(s, 'diagonals');

  if (s.path[1] < r.path[0]) {
    out.path = COPY.slow.pathShort(r.path[0]);
  } else if (s.path[0] > r.path[1]) {
    out.path = COPY.slow.pathLong(r.path[1]);
  }

  if (levelRange(s, 'straights')[1] < 2) {
    out.straights = COPY.slow.straightShort;
  }

  if (diagonalHigh < 3) {
    out.diagonals = COPY.noDiagonal;
  } else if (diagonalLow > diagonalReach(s.size)) {
    out.diagonals = COPY.longDiagonal(diagonalReach(s.size));
  }

  if (s.competition && s.loops[1] === 0) {
    out.loops = COPY.slow.noLoops;
  } else if (s.loopsRequired && s.loops[0] > r.loops) {
    out.loops = COPY.slow.manyLoops(r.loops);
  }

  for (const key of ['deadEnds', 'corridors'] as const) {
    if (outside(asRange(FIELDS[key].get(s)), r[key])) {
      out[key] = COPY.slow.texture(r[key][0], r[key][1]);
    }
  }

  const choice = NEEDS.choice(s);
  const gain = asRange(FIELDS.racingGain.get(s));

  if (choice && gain[0] > r.gain) {
    out.racingGain = COPY.slow.gain;
  }

  if (choice && outside(asRange(FIELDS.carefulLoss.get(s)), r.loss)) {
    out.carefulLoss = COPY.slow.loss;
  }

  const trap = s.trapLoss ?? TRAP.loss;

  if (NEEDS.trap(s) && trap > r.trap) {
    out.trapLoss = COPY.slow.deepTrap;
  } else if (NEEDS.trap(s) && choice && trap > gain[1]) {
    out.trapLoss = COPY.slow.trap(gain[1]);
  }

  return out;
}

/** The warning of search traps the path range leaves out, if any. */
export function trapNote(s: Settings): string | undefined {
  if (!NEEDS.trap(s)) {
    return undefined;
  }

  const n = trapReach(s);
  return s.path[0] > n ? COPY.trapNone(n) : s.path[1] > n ? COPY.trapSome(n) : undefined;
}

/** The note when every maze of these settings comes out one way, if it does. */
export function styleNote(s: Settings): string | undefined {
  const choice = NEEDS.choice(s);
  const trap = NEEDS.trap(s);
  const styles = new Set<Style>();

  for (const routeChoice of [true, false]) {
    for (const searchTrap of [true, false]) {
      const role = { ...s, choice: routeChoice, trap: searchTrap };

      if ((routeChoice ? choice : choiceShare(s) < 1) && (searchTrap ? trap : trapShare(s) < 1)) {
        for (const style of [...stylesFor(role, s.path[0]), ...stylesFor(role, s.path[1])]) {
          styles.add(style);
        }
      }
    }
  }

  const [only] = styles;
  return styles.size === 1 && only !== undefined ? COPY.oneStyle(TEXT.styles[only]) : undefined;
}

/** The hint under a field: why it does not apply, a warning, or what it means. */
export function fieldHint(s: Settings, key: FieldKey): { text: string; warning: boolean } {
  const { needs } = FIELDS[key];

  if (needs !== undefined && !NEEDS[needs](s)) {
    return { text: COPY.needs[needs], warning: false };
  }

  const warning = slowNotes(s)[key];

  if (warning !== undefined) {
    return { text: warning, warning: true };
  }

  const where =
    choiceShare(s) >= 1 ? 'racing' : NEEDS.choice(s) || NEEDS.trap(s) ? 'mixed' : 'shortest';
  const text =
    key === 'straights'
      ? `${COPY.on[where]}; a whole edge is ${s.size - 1}`
      : key === 'diagonals'
        ? `${COPY.on[where]}; long diagonals come as staircases (tag Staircase)`
        : (COPY.hints[key] ?? '');
  return { text, warning: false };
}

/** The English copy of the form. */
export const COPY = {
  preset: 'Preset',
  custom: (name: string) => `Custom (from ${name})`,
  reset: (name: string) => `Reset to ${name}`,
  size: 'Size',
  sizeNote: '32 × 32 takes a few seconds per maze',
  from: 'From',
  to: 'To',
  between: 'to',
  levels: { low: 'Short', medium: 'Medium', high: 'Long' } satisfies Record<Level, string>,
  on: {
    racing: 'On the diagonal route (amber)',
    shortest: 'On the shortest path',
    mixed:
      'On the diagonal route (amber) of mazes with a route choice or a bait, else on the shortest path',
  },
  rangeError: (lo: number, hi: number) =>
    `Whole numbers from ${lo} to ${hi}, the first not above the second`,
  noDiagonal:
    'Almost every maze has a diagonal of 3 moves: with a top below 3 the generator rarely finds one',
  longDiagonal: (n: number) =>
    `Diagonals of more than ${n} moves are rare on this board: many mazes will come out off target`,
  slow: {
    pathShort: (n: number) =>
      `No maze has a shortest path under about ${n} cells: each one takes many seconds and comes out off target`,
    pathLong: (n: number) =>
      `No maze has a shortest path over about ${n} cells: each one takes many seconds and comes out off target`,
    straightShort: 'Every maze has a straight of 2 moves: a top below 2 cannot be met',
    noLoops:
      'A maze without loops is solved by a wall follower: the competition rules keep one loop anyway',
    manyLoops: (n: number) =>
      `More than ${n} loops is rare on this board: expect slow, off-target mazes`,
    texture: (lo: number, hi: number) =>
      `Outside ${lo}–${hi} % the generator rarely gets there: expect slow, off-target mazes`,
    gain: 'A gain with diagonals above 25 % is rare: expect slow, off-target mazes',
    loss: 'A robot without diagonals nearly always loses 1 % or more on the diagonal route, and rarely over 25 %: expect slow, off-target mazes',
    trap: (n: number) =>
      `Mazes with a route choice trap only by their gain with diagonals, at most ${n} %: above it only mazes without a route choice get a trap`,
    deepTrap: 'Traps over 40 % are rare: expect slow, off-target mazes',
  },
  oneStyle: (style: string) =>
    `With these settings every maze comes out one way (${style.toLowerCase()}). A lower start of the path range gives more variety.`,
  rulesTitle: 'Rules',
  rules: {
    competition: ['Competition rules', 'Every post keeps a wall'],
    follower: ['No wall follower', 'No left- or right-hand wall follower reaches the goal'],
    oneEntry: ['One entry to the goal', 'The goal opens through one wall slot'],
    loopsRequired: ['Loops required', ''],
    contest: [
      'Never trivial',
      'Some decision always matters: explore more, or pick a route for your robot',
    ],
    goal: ['3 × 3 goal off the centre', 'Placed anew on every maze, as in the half-size finals'],
  } satisfies Record<RuleKey | 'goal', readonly [string, string]>,
  modes: { always: 'Always', mix: 'Mix', none: 'Don’t require' } satisfies Record<Mode, string>,
  modeTitle: {
    choice: 'Route choice',
    trap: 'Search traps',
    zigzag: 'Zigzag',
    dashed: 'Dashed walls',
    fishbone: 'Fishbone corridor',
  } satisfies Record<ModeKey, string>,
  modeHint: {
    zigzag: {
      always:
        'Every maze: a slalom on the diagonal route (amber), stubs from either side in turn, so even a robot with diagonals changes heading every cell',
      mix: (s: Settings) =>
        `In ${pct(s.zigzag)} % of the mazes: a slalom on the diagonal route (amber), the heading changing every cell even with diagonals`,
      none: 'Not required: a maze may still get one by chance',
    },
    dashed: {
      always:
        'Every maze: an open area of short walls the diagonal route (amber) crosses row after row, through the gaps, with no side wall to correct the position on',
      mix: (s: Settings) =>
        `In ${pct(s.dashed)} % of the mazes: an open area of short walls the diagonal route (amber) crosses row after row, with no side wall to correct the position on`,
      none: 'Not required: a maze may still get one by chance',
    },
    fishbone: {
      always:
        'Every maze: a straight on the diagonal route (amber) lined with stubs instead of side walls, nothing to re-centre on or to reset the distance at',
      mix: (s: Settings) =>
        `In ${pct(s.fishbone)} % of the mazes: a straight on the diagonal route (amber) lined with stubs instead of side walls`,
      none: 'Not required: a maze may still get one by chance',
    },
    choice: {
      always: 'Every maze: robots with and without diagonals take different routes',
      mix: (s: Settings) =>
        `In ${Math.round(100 * choiceShare(s))} % of the mazes robots with and without diagonals take different routes`,
      none: 'Not required: a maze may still get one by chance',
    },
    trap: {
      always: (s: Settings) =>
        `Every maze: the route a quick explorer finds is ${s.trapLoss ?? TRAP.loss} % or more slower`,
      mix: (s: Settings) =>
        `In ${Math.round(100 * trapShare(s))} % of the mazes the route a quick explorer finds is ${s.trapLoss ?? TRAP.loss} % or more slower`,
      none: 'Not required: a quick explorer may still miss the best route by chance',
    },
  } satisfies Record<ModeKey, Record<Mode, string | ((s: Settings) => string)>>,
  scoring: 'Scoring',
  scorings: { best: 'Best run', search: 'Run + search ÷ 30' } satisfies Record<Scoring, string>,
  scoringHint: {
    best: 'Japan, Brazil: a long search pays, so some mazes hide their best route',
    search: 'APEC, UK: no deep search traps, one more near-tied route by default',
  } satisfies Record<Scoring, string>,
  loopsHint: (t: Range, required: boolean) =>
    required ? `${t[0]} to ${t[1]} loops` : `Up to ${t[1]} loops, none required`,
  trapNone: (n: number) =>
    `No maze can get a search trap with this path range: it needs a shortest path of at most ${n} cells`,
  trapSome: (n: number) => `Only mazes of up to ${n} cells can get a search trap`,
  tuning: 'Fine tuning',
  fields: {
    path: 'Shortest path, in cells',
    straights: 'Longest straight, in moves',
    diagonals: 'Longest diagonal, in moves',
    loops: 'Loops',
    deadEnds: 'Dead ends, % of the cells',
    corridors: 'Straight corridors, % of the cells',
    racingGain: 'Gain with diagonals, %',
    carefulLoss: 'Loss without diagonals, %',
    trapLoss: 'Search trap, least loss in %',
    choiceShare: 'Route choice, % of the mazes',
    trapShare: 'Search traps, % of the mazes',
    ties: 'Near-tied routes, at least',
    symmetric: 'Partly symmetric mazes, %',
    westStart: 'Start up the whole west column, % of the mazes',
    twoDoors: 'Goal with two doors, % of the mazes',
    room: 'Walled-off open areas, % of the cells',
    zigzagCells: 'Zigzag length, cells',
    dashedCells: 'Dashed walls, rows crossed',
    fishboneCells: 'Fishbone corridor length, cells',
  } satisfies Record<FieldKey, string>,
  hints: {
    zigzagCells:
      'Longer means more heading changes in a row, no straight or long diagonal fits: finals 5 to 11',
    dashedCells:
      'More means longer weaving between wall ends with no side wall: half-size finals 6 to 12 rows',
    fishboneCells:
      'Longer means longer without a side wall to re-centre on: finals 3 to 7, half size up to 11',
    racingGain:
      'How much faster a robot with diagonals is on its own fastest route (amber) than on the fastest route without diagonals (white)',
    carefulLoss:
      'How much slower a robot without diagonals is on the diagonal route (amber) than on its own fastest route (white)',
    trapLoss: 'Deep traps of bait routes ask for 20 % or more',
    ties: 'Routes within 5 % of the fastest of a robot with diagonals; finals have about 3',
    symmetric: 'Mirrored in part on the start–goal diagonal, as 45 % of the finals',
    westStart: 'Half the finals open with this straight',
    room: 'Closed areas with no walls inside, scattered over the board as in the half-size finals',
  } as Partial<Record<FieldKey, string>>,
  needs: {
    zigzag: 'Needs Zigzag on Always or Mix',
    dashed: 'Needs Dashed walls on Always or Mix',
    fishbone: 'Needs Fishbone corridor on Always or Mix',
    choice: 'Needs Route choice on Always or Mix',
    trap: 'Needs Search traps on Always or Mix',
    choiceMix: 'Needs Route choice on Mix',
    trapMix: 'Needs Search traps on Mix',
    '!oneEntry': 'Needs One entry to the goal off',
    half: 'Only on 32 × 32, as no final 16 × 16 has one',
  } satisfies Record<Need, string>,
};
