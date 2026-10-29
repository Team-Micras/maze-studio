/**
 * The targets a generated maze missed, in plain words, from the generator's own `report` and
 * `choiceMisses` against the targets of its seed: what an off-target card says it lacks.
 *
 * @module
 */

import {
  choiceMisses,
  MOTIFS,
  report,
  TEXT,
  type Analysis,
  type ChoiceMiss,
  type Range,
  type Targets,
} from '@/generator';

const asked = ([lo, hi]: Range): string =>
  hi === Number.POSITIVE_INFINITY ? `asked ${lo} or more` : `asked ${lo}–${hi}`;

const outside = (v: number, [lo, hi]: Range): boolean => v < lo || v > hi;

const round = (v: number): number => Math.round(v);

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const CHOICE_TEXT: Readonly<Record<ChoiceMiss, (a: Analysis, t: Targets) => string>> = {
  routes: () => 'no route choice',
  detour: (a, t) =>
    `diagonal route (amber) off the route without diagonals (white) for ${round(100 * (a.choice?.detour ?? 0))} % (asked ${t.choice?.detour ?? 0} % or more)`,
  apart: (a, t) =>
    `routes ${a.choice?.apart ?? 0} cells apart (asked ${t.choice?.apart ?? 0} or more)`,
  gain: (a, t) =>
    `gain with diagonals ${round(a.choice?.racingGain ?? 0)} % (${asked(t.choice?.gain ?? [0, 0])})`,
  loss: (a, t) =>
    `loss without diagonals ${round(a.choice?.carefulLoss ?? 0)} % (${asked(t.choice?.loss ?? [0, 0])})`,
  shape: () => 'a route too twisty for its shape',
};

/** The targets the maze misses, each a short phrase; empty when it meets every one. */
export function missedTargets(a: Analysis, t: Targets): string[] {
  const met = report(a, t);
  const out: string[] = [];
  const levels = t.levelsOn === 'racing' ? a.choice?.racingShape : a;

  if (!met.rules) {
    out.push(a.shortest < 0 ? 'the goal cannot be reached' : 'a wall follower reaches the goal');
  }

  if (!met.path && a.shortest >= 0) {
    out.push(`shortest path ${a.shortest} cells (${asked(t.path)})`);
  }

  if (met.straight === false && levels !== undefined) {
    out.push(`longest straight ${levels.maxStraight} (${asked(t.straight)})`);
  }

  if (met.diagonal === false && levels !== undefined) {
    out.push(`longest diagonal ${levels.maxDiagonal} (${asked(t.diagonal)})`);
  }

  if (!met.loops) {
    out.push(`${count(a.loops, 'loop', 'loops')} (${asked(t.loops)})`);
  }

  if (outside(a.deadEnds, t.deadEnds)) {
    out.push(`dead ends ${round(a.deadEnds)} % (${asked(t.deadEnds)})`);
  }

  if (outside(a.corridors, t.corridors)) {
    out.push(`straight corridors ${round(a.corridors)} % (${asked(t.corridors)})`);
  }

  if (met.choice === false) {
    out.push(...choiceMisses(a, t).map((miss) => CHOICE_TEXT[miss](a, t)));
  }

  if (met.ties === false) {
    out.push(
      `${count(a.ties ?? 0, 'near-tied route', 'near-tied routes')} (asked ${t.ties ?? 0} or more)`
    );
  }

  if (met.contest === false) {
    out.push('trivial: no decision matters');
  }

  if (met.trap === false && t.trap !== null) {
    out.push(`search trap ${round(a.trap ?? 0)} % (asked ${t.trap[0]} % or more)`);
  }

  if (met.board === false) {
    if (t.doors !== null && a.doors !== t.doors) {
      out.push(`goal with ${a.doors ?? 0} doors (asked ${t.doors})`);
    }

    if (t.symmetry !== null && (a.symmetry === undefined || outside(a.symmetry, t.symmetry))) {
      out.push(`symmetry ${round(a.symmetry ?? 0)} % (${asked(t.symmetry)})`);
    }

    for (const motif of MOTIFS) {
      const range = t.motifs?.[motif];
      const cells = a.sensor?.[motif] ?? 0;
      const name = TEXT.tags[motif].toLowerCase();

      if (range !== undefined && outside(cells, range)) {
        out.push(
          cells === 0 ? `no ${name}` : `${name} ${count(cells, 'cell', 'cells')} (${asked(range)})`
        );
      }
    }
  }

  if (met.shortest === false) {
    out.push(
      t.bait && !(a.bait !== undefined && a.bait > 0)
        ? 'no bait route'
        : 'the shortest route does not lose'
    );
  }

  return out;
}

/** What an off-target maze says: "Off target: …" with what it missed. */
export function offTarget(misses: readonly string[] | undefined): string {
  return misses === undefined || misses.length === 0
    ? 'Off target'
    : `Off target: ${misses.join(', ')}`;
}
