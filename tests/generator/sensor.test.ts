import { describe, expect, test } from 'vitest';

import { analyse, random, tags, type Grid } from '@/generator';
import { setWall } from '@/generator/grid';
import { fastestRoute, PROFILES } from '@/generator/racing';
import { lineRun } from '@/generator/routes';
import { bareEndPost, closedBoard } from '@/generator/rules';
import { MOTIF_MIN, motifsOf, sensor, STAIRCASE_MIN, type Motif } from '@/generator/sensor';

const edge = (c: number) => Math.min(c % 16, 15 - (c % 16), c >> 4, 15 - (c >> 4));

/** A closed 16 × 16 board with a straight route east along the fourth row, and its cells. */
function straightRoute(): { g: Grid; route: number[] } {
  const g = closedBoard(16);
  const route = Array.from({ length: 14 }, (_, x) => 3 * 16 + x + 1);
  for (let i = 1; i < route.length; i++) {
    setWall(g, route[i - 1], 1, 0);
  }
  return { g, route };
}

describe('the sensor motifs', () => {
  test.each(['zigzag', 'fishbone', 'dashed'] as const)(
    'builds a %s on a straight run and measures it as itself',
    (kind: Motif) => {
      const { g, route } = straightRoute();
      const taken = new Uint8Array(256);
      for (const c of route) {
        taken[c] = 1;
      }
      const used = lineRun(g, random(3), taken, route, kind === 'fishbone' ? 5 : 8, kind, {
        band: [2, Infinity],
      });
      expect(used).toBeGreaterThan(0);
      for (let c = 0; c < 256; c++) {
        expect(bareEndPost(g, c, 0) || bareEndPost(g, c, 1)).toBe(false);
      }
      const raced =
        kind === 'fishbone'
          ? route
          : fastestRoute(
              { ...g, start: route[0], goals: [route[route.length - 1]] },
              PROFILES.diagonal
            ).route;
      const m = sensor(g, raced);
      expect(Math.min(...m.cells[kind].map(edge))).toBeGreaterThanOrEqual(2);
      expect(motifsOf(m)).toEqual([kind]);
      expect(m[kind]).toBeGreaterThanOrEqual(MOTIF_MIN[kind]);
      expect(kind !== 'zigzag' || (m.zigzagTurns >= 0.4 && m.staircase < STAIRCASE_MIN)).toBe(true);
    }
  );

  test('counts no dashed area where the dashes run along the route', () => {
    const g = closedBoard(16);
    const lane = Array.from({ length: 12 }, (_, x) => 6 * 16 + x + 2);
    for (let i = 1; i < lane.length; i++) {
      setWall(g, lane[i - 1], 1, 0);
    }
    for (const c of lane) {
      for (const k of [1, 2]) {
        for (const y of [-1, 0]) {
          setWall(g, c + k * 16 + y * 16, 0, (c + k) % 2);
        }
        setWall(g, c + k * 16, 1, 0);
      }
    }
    expect(sensor(g, lane).dashed).toBe(0);
  });

  test('reads a staircase as a staircase, not a zigzag, and tags it', () => {
    const g = closedBoard(16);
    const steps = [17];
    while (steps.length < 12) {
      steps.push(steps[steps.length - 1] + (steps.length % 2 ? 1 : 16));
    }
    for (let i = 1; i < steps.length; i++) {
      setWall(g, steps[i - 1], steps[i] - steps[i - 1] === 1 ? 1 : 0, 0);
    }
    const climbed = sensor(g, steps);
    expect(climbed.staircase).toBeGreaterThanOrEqual(STAIRCASE_MIN);
    expect(climbed.zigzag).toBe(0);
    const a = analyse({ ...g, start: 17, goals: [steps[steps.length - 1]] });
    expect(tags({ ...a, sensor: climbed })).toContain('staircase');
  });
});
