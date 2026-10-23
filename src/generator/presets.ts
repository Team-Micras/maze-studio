/**
 * Settings presets. The first, Recommended, is the default; the others are calibrated on real
 * finals of the mazefiles corpus with the generator's own analysis, on a training fold only (a
 * third of the finals is held out to judge them). Ranges are p10 to p90 of each number, the
 * careful loss p25 to p75; straights and diagonals span the racing route and the shortest path.
 * Each share is the share of training finals that has the feature: routes that split, a search
 * trap, a partial symmetry, the start up the whole west column, a second goal door, the sensor
 * motifs, a shortest route that loses and a class that flips. The hard rules stay on where the
 * competition has them. Switching board size scales the path range by 2, the loop range by 4 and
 * the straights and diagonals by the board side.
 *
 * @module
 */

import type { Range, Settings } from './types';

/** A named set of settings. */
export interface Preset {
  readonly id: string;
  readonly label: string;
  /** Where its numbers come from. */
  readonly source: string;
  readonly settings: Settings;
}

const RULES = { competition: true, oneEntry: true, loopsRequired: true } as const;

/** The presets, Recommended first. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'recommended',
    label: 'Recommended',
    source:
      'Balanced for Brazilian finals: a route choice in half the mazes, some search traps, texture and shapes of the finals 16 × 16',
    settings: {
      size: 16,
      path: [60, 100],
      straights: [7, 15],
      diagonals: [4, 12],
      loops: [5, 20],
      ...RULES,
      choice: 0.5,
      trap: 0.3,
      symmetric: 0.45,
      westStart: 0.5,
      zigzag: 0.12,
      dashed: 0.01,
      fishbone: 0.1,
      shortestLoses: { orthogonal: 0.16, diagonal: 0.06, both: 0.11 },
      classFlip: 0.49,
    },
  },
  {
    id: 'japan',
    label: 'All Japan',
    source: 'Calibrated on 21 of 30 All Japan finals, 1985–2023, the rest held out',
    settings: {
      size: 16,
      path: [57, 99],
      straights: [6, 15],
      diagonals: [4, 14],
      loops: [6, 19],
      ...RULES,
      oneEntry: false,
      choice: 0.38,
      trap: 0.33,
      deadEnds: [6, 14],
      corridors: [28, 45],
      racingGain: [5, 24],
      carefulLoss: [8, 35],
      symmetric: 0.48,
      westStart: 0.52,
      twoDoors: 0.29,
      zigzag: 0.17,
      fishbone: 0.23,
      shortestLoses: { orthogonal: 0.23, diagonal: 0.03, both: 0.23 },
      classFlip: 0.39,
    },
  },
  {
    id: 'japan-half',
    label: 'All Japan half size',
    source:
      'Calibrated on 8 of 12 All Japan half-size finals on the whole 32 × 32 board, 2010–2023: a 3 × 3 goal off the centre, walled-off open areas',
    settings: {
      size: 32,
      path: [83, 176],
      straights: [15, 31],
      diagonals: [4, 24],
      loops: [45, 95],
      ...RULES,
      choice: 0.38,
      trap: 0.6,
      deadEnds: [2, 10],
      corridors: [31, 56],
      racingGain: [6, 20],
      carefulLoss: [5, 17],
      symmetric: 0.13,
      westStart: 0.25,
      goal: 3,
      room: 0.15,
      zigzag: 0.08,
      dashed: 0.42,
      fishbone: 0.17,
      shortestLoses: { both: 0.4 },
      classFlip: 0.67,
    },
  },
  {
    id: 'apec',
    label: 'APEC',
    source:
      'Calibrated on 9 of 14 APEC finals, 2002–2025: long routes, the start up the west column, run + search time scoring',
    settings: {
      size: 16,
      path: [85, 131],
      straights: [12, 15],
      diagonals: [4, 13],
      loops: [1, 9],
      ...RULES,
      choice: false,
      trap: false,
      deadEnds: [5, 11],
      corridors: [46, 58],
      symmetric: 0.78,
      westStart: 0.89,
      scoring: 'search',
      zigzag: 0.21,
      shortestLoses: { orthogonal: 0.07, diagonal: 0.14, both: 0.07 },
      classFlip: 0.5,
    },
  },
  {
    id: 'uk',
    label: 'UK',
    source:
      'Calibrated on 27 of 36 UK finals, 2000–2025: run + search time scoring, wall followers allowed',
    settings: {
      size: 16,
      path: [35, 80],
      straights: [5, 15],
      diagonals: [3, 10],
      loops: [6, 26],
      ...RULES,
      oneEntry: false,
      follower: false,
      choice: 0.26,
      trap: 0.3,
      deadEnds: [2, 17],
      corridors: [28, 52],
      racingGain: [3, 14],
      carefulLoss: [1, 7],
      ties: 2,
      symmetric: 0.33,
      westStart: 0.44,
      twoDoors: 0.11,
      scoring: 'search',
      zigzag: 0.06,
      dashed: 0.03,
      fishbone: 0.03,
      shortestLoses: { orthogonal: 0.14, diagonal: 0.06, both: 0.03 },
      classFlip: 0.62,
    },
  },
  {
    id: 'single',
    label: 'One route',
    source:
      'Calibrated on 41 of the 60 finals 16 × 16 whose fastest routes do not split, 1985–2025: no route choice, two or more competitive lines',
    settings: {
      size: 16,
      path: [39, 105],
      straights: [7, 15],
      diagonals: [3, 12],
      loops: [4, 21],
      ...RULES,
      choice: false,
      trap: 0.2,
      deadEnds: [3, 15],
      corridors: [30, 58],
      symmetric: 0.56,
      westStart: 0.61,
      zigzag: 0.12,
      fishbone: 0.1,
      shortestLoses: { orthogonal: 0.16, diagonal: 0.04, both: 0.07 },
      classFlip: 0.4,
    },
  },
];

/**
 * Settings for another board size: path and loop ranges scale with it, and so do straights and
 * diagonals given in moves, with the board side (a whole edge stays a whole edge). The walled-off
 * open areas stay on 32 × 32, as no final 16 × 16 has one.
 */
export function resize(s: Settings, size: 16 | 32): Settings {
  if (s.size === size) {
    return s;
  }
  const f = size / s.size;
  const side = <T extends string>(v: T | Range): T | Range =>
    typeof v === 'string'
      ? v
      : [
          Math.round((v[0] * (size - 1)) / (s.size - 1)),
          Math.round((v[1] * (size - 1)) / (s.size - 1)),
        ];
  const { room, ...rest } = s;
  return {
    ...rest,
    ...(size === 32 && room && { room }),
    size,
    path: [Math.round(s.path[0] * f), Math.round(s.path[1] * f)],
    loops: [Math.round(s.loops[0] * f * f), Math.round(s.loops[1] * f * f)],
    straights: side(s.straights),
    diagonals: side(s.diagonals),
  };
}
