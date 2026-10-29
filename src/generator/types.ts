/**
 * The shapes the generator's stages share: the settings a room picks, the seed drawn from them, the
 * targets a maze is judged against, and the analysis that judges it.
 *
 * @module
 */

import type { BaseAnalysis, ShapeCap } from './analysis';
import type { RobotClass, RouteChoice, ShortestCost } from './racing';
import type { Motif, Sensor } from './sensor';

/** A range of numbers, both ends included. */
export type Range = readonly [low: number, high: number];

/** A level of the longest straight or diagonal. */
export type Level = 'low' | 'medium' | 'high';

/** Who must lose on the shortest route: the robot without diagonals, the one with them, or both. */
export type LosingKind = 'orthogonal' | 'diagonal' | 'both';

/** Whether the weak and strong classes keep what the mid class gets, or one of them lacks it. */
export type Classes = 'hold' | 'flip';

/** How a maze was made. */
export type Style =
  | 'split'
  | 'lane'
  | 'stairs'
  | 'late'
  | 'crossing'
  | 'bait'
  | 'tie'
  | 'annealed'
  | 'variation';

/** The motifs a seed asks for, with their length on the route. */
export type Motifs = Partial<Record<Motif, Range>>;

/** The settings of the generator, what a room agrees on. */
export interface Settings {
  readonly size: 16 | 32;
  /** Shortest path in cells. */
  readonly path: Range;
  /**
   * Longest straight on the racing robot's route with the route choice, else on the shortest
   * path: a level or moves from-to (a whole edge is `size - 1`).
   */
  readonly straights: Level | Range;
  /** Longest zigzag, measured on the same route as the straights. */
  readonly diagonals: Level | Range;
  /** Loop count when loops are required. */
  readonly loops: Range;
  /**
   * Every post outside the goal keeps a wall, and unless `follower` says otherwise no wall
   * follower reaches the goal.
   */
  readonly competition: boolean;
  /** No wall follower reaches the goal, by default as `competition`; UK finals allow it. */
  readonly follower?: boolean;
  /** The goal opens to the maze through one edge only. */
  readonly oneEntry: boolean;
  /** At least `loops[0]` loops, otherwise 0 is allowed. */
  readonly loopsRequired: boolean;
  /** Share of the seeds with a route choice, `true` every seed. */
  readonly choice: boolean | number;
  /** Share of the seeds that hide the racing route from a flood-fill round trip. */
  readonly trap?: boolean | number;
  /** Least near-tied routes, 0 for no target. */
  readonly ties?: number;
  /** Every maze is a contest rather than trivial, on unless set to false. */
  readonly contest?: boolean;
  /** Share of the seeds that aim at a partial symmetry on the start-goal diagonal. */
  readonly symmetric?: number;
  /** Share of the seeds whose start runs up the whole west column. */
  readonly westStart?: number;
  /** Share of the seeds whose goal opens through a second door, with `oneEntry` off. */
  readonly twoDoors?: number;
  /** Best run (Japan, Brazil), or run plus a 30th of the search time (APEC, UK). */
  readonly scoring?: 'best' | 'search';
  /** The side of the goal block: 2 in the middle (default), 3 off the centre. */
  readonly goal?: 2 | 3;
  /** Share of the cells walled off in open areas without inner walls; 0 for none. */
  readonly room?: number;
  /** Share of the seeds whose racing route runs a zigzag slalom. */
  readonly zigzag?: boolean | number;
  /** Share of the seeds whose racing route crosses a dashed area of broken walls. */
  readonly dashed?: boolean | number;
  /** Share of the seeds whose racing route runs a fishbone corridor. */
  readonly fishbone?: boolean | number;
  readonly zigzagCells?: Range;
  readonly dashedCells?: Range;
  readonly fishboneCells?: Range;
  /** Dead ends in % of the cells. */
  readonly deadEnds?: Range;
  /** Straight corridors in % of the cells. */
  readonly corridors?: Range;
  /** The racing robot's gain on its own route, %. */
  readonly racingGain?: Range;
  /** What the careful robot loses on the racing route, %. */
  readonly carefulLoss?: Range;
  /** Least loss in % of a seed that asks for a search trap. */
  readonly trapLoss?: number;
  /** Share of the seeds whose shortest route loses for each robot. */
  readonly shortestLoses?: Readonly<Partial<Record<LosingKind, number>>>;
  /** Share of the seeds where a weaker or stronger robot class lacks what the mid class gets. */
  readonly classFlip?: number;
}

/**
 * The settings of one seed: the shares drawn into a route choice, a search trap, the start up the
 * whole west column, a second goal door, a symmetry window, the sensor motifs, who loses on the
 * shortest route and whether the classes keep what the mid class gets, and the goal cells and
 * walled-off open areas of its board.
 */
export interface Seed extends Omit<
  Settings,
  'choice' | 'trap' | 'westStart' | 'twoDoors' | 'room'
> {
  readonly choice: boolean;
  readonly trap: boolean;
  readonly westStart: boolean;
  readonly twoDoors: boolean;
  readonly symmetry: Range | null;
  readonly goals?: readonly number[];
  readonly room: Uint8Array | null;
  readonly motifs: Motifs | null;
  readonly losing: LosingKind | null;
  readonly classes: Classes | null;
}

/** Settings or a seed, what the targets are resolved from. */
export interface SeedLike extends Omit<
  Settings,
  'choice' | 'trap' | 'westStart' | 'twoDoors' | 'room'
> {
  readonly choice: boolean | number;
  readonly trap?: boolean | number;
  readonly westStart?: boolean | number;
  readonly twoDoors?: boolean | number;
  readonly room?: number | Uint8Array | null;
  readonly symmetry?: Range | null;
  readonly goals?: readonly number[];
  readonly motifs?: Motifs | null;
  readonly losing?: LosingKind | null;
  readonly classes?: Classes | null;
}

/** A board's own parts: its size, goal cells and walled-off room. */
export interface BoardParts {
  readonly size: 16 | 32;
  readonly goals?: readonly number[];
  readonly room?: Uint8Array | null;
}

/** The route choice target. */
export interface ChoiceTarget {
  /** Least share of the racing route in one stretch off the careful route, %. */
  readonly detour: number;
  /** Least distance between the routes, cells. */
  readonly apart: number;
  /** The racing robot's gain on its own route, %. */
  readonly gain: Range;
  /** What the careful robot loses on it, %. */
  readonly loss: Range;
}

/** The shape caps of the two routes. */
export interface Shape {
  readonly racing: ShapeCap;
  readonly careful: ShapeCap;
}

/** "Shortest is not fastest" as a target. */
export interface ShortestTarget {
  readonly kind: LosingKind;
  readonly loss: number;
  readonly cells: number;
}

/** What a maze is judged against. */
export interface Targets {
  readonly path: Range;
  readonly straight: Range;
  readonly diagonal: Range;
  /** The route the straight and diagonal are measured on. */
  readonly levelsOn: 'racing' | 'shortest';
  readonly loops: Range;
  readonly choice: ChoiceTarget | null;
  /** Route shape, with the levels on the racing route. */
  readonly shape: Shape | null;
  readonly deadEnds: Range;
  readonly corridors: Range;
  /** No wall follower may reach the goal. */
  readonly follower: boolean;
  /** Search trap in %, drawn per seed. */
  readonly trap: Range | null;
  /** Least distinct routes of the racing robot within 5 % of its fastest. */
  readonly ties: number | null;
  /** The maze must be a contest, measured last. */
  readonly contest: boolean;
  /** Goal doors asked for when the seed drew a second one. */
  readonly doors: number | null;
  /** Sensor motifs the seed drew, with their cells on the racing route. */
  readonly motifs: Motifs | null;
  /** The share of the walls the mirror on the start-goal diagonal keeps, %. */
  readonly symmetry: Range | null;
  /** The shortest route loses for those robots. */
  readonly shortest: ShortestTarget | null;
  /** The bait style's promise: the flood-fill robot's route stays shorter and slower. */
  readonly bait: boolean;
  /** A preference of the routes-first construction, not scored. */
  readonly classes: Classes | null;
}

/** The analysis plus what the targets ask for. */
export interface Analysis extends BaseAnalysis {
  /** The route choice, when measured. */
  choice?: RouteChoice | null;
  /** Whether a wall follower reaches the goal. */
  follower?: boolean;
  /** The search trap, %. */
  trap?: number;
  /** The route a flood-fill robot races after one round trip, start first. */
  search?: number[];
  /** Near-tied routes. */
  ties?: number;
  /** Whether the maze is a contest rather than trivial. */
  contest?: boolean;
  /** Goal doors. */
  doors?: number;
  /** Symmetry, %. */
  symmetry?: number;
  /** Sensor motifs on either fastest route. */
  sensor?: Sensor;
  /** "Shortest is not fastest" per robot class. */
  slow?: Partial<Record<RobotClass, ShortestCost>>;
  /** The route choice of the weak and strong classes. */
  classChoice?: Partial<Record<RobotClass, { racingGain: number; carefulLoss: number }>>;
  /** What the racing robot loses on the bait, %. */
  bait?: number;
  /** How the maze was made. */
  style?: Style;
}

/**
 * Records a step of the generator for an animation; never set in normal use. The stage names the
 * step (`candidate` for a route drawn and not yet judged, `routes`, `filler`, `loop`, `tune`,
 * `board` and so on), the walls are the board at that step, shared and changed by later steps.
 * The walls and the info are the generator's own: a trace only reads them, or the same seed would
 * build other walls once traced.
 */
export type Trace = (
  stage: string,
  walls: Uint8Array,
  info?: Readonly<Record<string, unknown>>
) => void;
