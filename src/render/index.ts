/**
 * Drawing mazes: where things are on a board, the track and the editor's overlays as path data,
 * the wall stroke, the camera, the minimap's arithmetic and the canvas thumbnails. It depends only
 * on `src/maze` and never on React; `src/ui` turns these into components.
 *
 * @module
 */

export {
  boardLimits,
  centerOn,
  clamp,
  constrainCamera,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_PHONE_EDIT_INSETS,
  EDITOR_PHONE_INSETS,
  EDITOR_ZOOM,
  fitCamera,
  flightPath,
  panCamera,
  pinchCamera,
  toScreen,
  toWorld,
  visibleWorld,
  zoomAround,
  zoomOf,
  type BoardView,
  type Camera,
  type CameraLimits,
  type Insets,
  type PointerPair,
  type ScreenPoint,
  type ViewportSize,
  type WorldPoint,
  type WorldRect,
  type ZoomRange,
} from './camera';
export {
  KEY_ZOOM_FACTOR,
  WHEEL_LINE_PIXELS,
  wheelIntent,
  zoomKey,
  type WheelInput,
  type WheelIntent,
  type ZoomKey,
} from './camera-input';
export { cubicBezier, EASE_FLIGHT, EASE_OUT, type Easing } from './easing';
export { cellInWorld, cellOnScreen, MIN_TOUCH_CELL, mazePointAt } from './board-placement';
export {
  ARTBOARD_SIZE,
  boardGeometry,
  cellAtPoint,
  cellRect,
  EDGE_TOLERANCE,
  nearestCell,
  nearestEdge,
  slotRect,
  toBoardPoint,
  toMazePoint,
  wallRect,
  type BoardGeometry,
  type BoardPoint,
  type BoardRect,
  type MazePoint,
  type TrackScale,
} from './geometry';
export {
  ARTBOARD_GAP_X,
  ARTBOARD_GAP_Y,
  artboardIn,
  cellOf,
  LIBRARY_INSETS,
  LIBRARY_ZOOM,
  libraryColumns,
  libraryGrid,
  libraryLimits,
  mountedRows,
  revealCamera,
  rowOf,
  type LibraryGrid,
  type MazeSize,
  type RowRange,
} from './library-layout';
export { LruCache } from './lru-cache';
export { formatLength } from './path';
export {
  MINIMAP_SIZE,
  MINIMAP_ZOOM_THRESHOLD,
  minimapFrame,
  minimapView,
  minimapWorldPoint,
  showsMinimap,
  type MinimapFrame,
  type MinimapRect,
} from './minimap';
export {
  diffLayers,
  overlayLayers,
  overlayStrokes,
  type BoardOverlays,
  type Dash,
  type DiffLayers,
  type EdgePreview,
  type FindingFocus,
  type OverlayLayers,
  type OverlayStrokes,
} from './overlay-layers';
export {
  applyStroke,
  beginStroke,
  extendStroke,
  STROKE_STEP,
  type Stroke,
  type StrokeAxis,
  type StrokeStepOptions,
} from './stroke';
export {
  drawThumbnail,
  paintTrack,
  THUMBNAIL_BANDS,
  THUMBNAIL_CACHE_BYTES,
  ThumbnailCache,
  thumbnailBand,
  thumbnailBytes,
  thumbnailSize,
  type Canvas2D,
  type ThumbnailBand,
  type ThumbnailSize,
} from './thumbnails';
export { TRACK_COLORS, TRACK_OPACITY } from './track-colors';
export { trackLayers, type TrackLayers } from './track-layers';
