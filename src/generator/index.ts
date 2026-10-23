/**
 * The maze generator: settings and presets, the generator itself with its recipes and wall hash,
 * variations, the numbers of a maze, its features and tags, and the pick of a varied batch. Pure
 * TypeScript and deterministic: the same settings and seed build the same walls on every engine,
 * with no React and no browser API. It reads `src/maze` only to turn a grid into a maze and back.
 *
 * @module
 */

export { analyse, symmetry, type BaseAnalysis, type Geometry } from './analysis';
export {
  BATCH,
  hasTrap,
  isSettings,
  LIKE,
  LIKE_STRENGTH,
  measure,
  pickBatch,
  POOL_FACTOR,
  readRecipe,
  savedGrid,
  TRAP_SHOWN,
  TUNING,
  withMaze,
  type Measured,
  type SavedRecipe,
} from './batch';
export {
  distance,
  pickDiverse,
  signature,
  type CandidateAnalysis,
  type Pickable,
  type Signature,
} from './diversity';
export {
  features,
  routes,
  shortestLoses,
  SPLIT,
  tags,
  TEXT,
  type Feature,
  type Tag,
  type TwoRoutes,
} from './features';
export {
  CHOICE,
  CHOICE_SHORT,
  choiceMisses,
  CONTEST,
  energy,
  generate,
  GENERATOR_VERSION,
  isContest,
  LEVELS,
  levelRange,
  MOTIF_CELLS,
  random,
  relaxedChoice,
  report,
  SHORTEST,
  STYLES,
  stylesFor,
  targets,
  TEXTURE,
  TIES,
  TRAP,
  trapReach,
  vary,
  wallHash,
  type Candidate,
  type ChoiceMiss,
  type Effort,
  type Recipe,
  type Report,
} from './generator';
export { fromMaze, toMaze, type Grid } from './grid';
export { PRESETS, resize, type Preset } from './presets';
export {
  PROFILES,
  RACERS,
  ROBOTS,
  routeChoice,
  type Profile,
  type RobotClass,
  type RouteChoice,
  type ShortestCost,
} from './racing';
export { searchRun, type SearchRun } from './search';
export { MOTIF_MIN, MOTIFS, motifsOf, STAIRCASE_MIN, type Motif, type Sensor } from './sensor';
export type {
  Analysis,
  ChoiceTarget,
  Classes,
  Level,
  LosingKind,
  Motifs,
  Range,
  Seed,
  Settings,
  Style,
  Targets,
  Trace,
} from './types';
