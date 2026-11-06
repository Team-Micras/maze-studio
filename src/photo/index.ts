/**
 * Photo to maze: the homography of the board, its straightened view, the fit to the posts, the
 * wall scores, and how a recognition compares with the true maze. Pure TypeScript over
 * `ImageData`-like photos, with no DOM and no other module of maze-studio but `src/maze`.
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
export { refinePosts } from './posts';
export { recogniseMaze, type MazeOutline, type Recognition } from './recognise';
export { rectify } from './rectify';
export { scoreRecognition, wrongEdges } from './score';
