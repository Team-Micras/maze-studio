/**
 * Photo to maze: the homography and lens of the board, its straightened view, the fit to the
 * posts, the wall scores, the rules the maze breaks, and how a recognition compares with the true
 * maze. Pure TypeScript over `ImageData`-like photos, with no DOM and no other module of
 * maze-studio but `src/maze`.
 *
 * @module
 */

export { normaliseLocally, otsuThreshold, scoreEdges, topHat, type EdgeScores } from './classify';
export {
  applyHomography,
  fitHomography,
  invertHomography,
  type Homography,
  type Point,
} from './homography';
export { lightness, sampleBilinear, type Photo, type Plane } from './image';
export {
  distort,
  foldRadius,
  K1_RANGE,
  lensOf,
  project,
  undistort,
  type Camera,
  type Lens,
} from './lens';
export { locateBoard, lowered, refinePosts, seesSides, type Search } from './posts';
export { recogniseMaze, type MazeOutline, type Recognition } from './recognise';
export { rectify } from './rectify';
export { brokenRules, HALF_SIZE, repairClassic, type BrokenRule } from './rules';
export { scoreRecognition, wrongEdges } from './score';
