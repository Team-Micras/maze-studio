/**
 * New mazes (PLAN.md 3.4, DESIGN.md 9.2): the three of the New maze menu and one of any size,
 * every one with its outer walls.
 *
 * @module
 */

import { fillBorder, setGoalArea, setStart, setWall } from './edits';
import { createMaze, type Maze } from './maze';
import type { Profile } from './validation-types';

/** The mazes the New maze menu offers by name. */
export type MazePreset = 'classic' | 'halfsize' | 'training';

/** The size, profile and starting marks of a preset. */
interface PresetShape {
  readonly side: number;
  readonly profile: Profile;
  /** The goal's south-west and north-east cells, or none. */
  readonly goal?: readonly [number, number];
}

const PRESETS: Readonly<Record<MazePreset, PresetShape>> = {
  classic: { side: 16, profile: 'classic', goal: [7, 8] },
  halfsize: { side: 32, profile: 'halfsize', goal: [15, 16] },
  training: { side: 16, profile: 'training' },
};

/** A maze of `width` by `height` cells with only its outer walls, no start and no goal. */
export function borderedMaze(width: number, height: number): Maze {
  return fillBorder(createMaze({ width, height }));
}

/**
 * A preset's maze: Classic is 16 × 16 with the start in (0, 0), walled on its east so the start
 * rule passes, and the goal from (7, 7) to (8, 8); Half size is 32 × 32 the same way with the goal
 * from (15, 15) to (16, 16); Training is 16 × 16 with the border only.
 */
export function presetMaze(preset: MazePreset): Maze {
  const { side, goal } = PRESETS[preset];
  const bordered = borderedMaze(side, side);

  if (goal === undefined) {
    return bordered;
  }

  const [low, high] = goal;
  const started = setWall(
    setStart(bordered, { x: 0, y: 0 }),
    {
      direction: 'vertical',
      x: 1,
      y: 0,
    },
    true
  );
  return setGoalArea(started, { from: { x: low, y: low }, to: { x: high, y: high } });
}

/** The profile a preset's maze is checked by. */
export function presetProfile(preset: MazePreset): Profile {
  return PRESETS[preset].profile;
}
