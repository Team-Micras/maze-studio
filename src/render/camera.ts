/**
 * The camera over the world of boards, as pure functions. A camera `{ x, y, k }` puts the world
 * point `(wx, wy)` on screen at `(x + wx × k, y + wy × k)`, in CSS pixels of the viewport.
 *
 * Every function returns a new camera; none reads the DOM, so fitting, zoom and pan limits, pinch
 * and the flight between two cameras are tested without a browser (DESIGN.md 7 and 8).
 *
 * @module
 */

/** Where the world is on screen and how large. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  /** Screen pixels per world unit. */
  readonly k: number;
}

/** A point on screen, in CSS pixels from the viewport's top-left corner. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** A point of the world. */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle of the world. */
export interface WorldRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The size of the viewport, in CSS pixels. */
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** Room left free around a fitted board for the islands, in CSS pixels. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The zoom allowed, as multiples of the fit. */
export interface ZoomRange {
  readonly min: number;
  readonly max: number;
}

/**
 * What keeps a camera in place over some content: the fitted camera, the zoom allowed around it,
 * and how a camera of an allowed zoom is panned back into place. Each canvas makes its own: the
 * board's keeps part of the board on screen, the library's scrolls its grid.
 */
export interface CameraLimits {
  readonly viewport: ViewportSize;
  /** The camera that fits the content. */
  readonly fit: Camera;
  /** The zoom allowed, in multiples of the fit. */
  readonly zoom: ZoomRange;
  /** The camera panned into place; its zoom is already within the range. */
  readonly place: (camera: Camera) => Camera;
}

/** Everything the camera's limits depend on while one board is shown. */
export interface BoardView {
  /** The board, in world units. */
  readonly board: WorldRect;
  readonly viewport: ViewportSize;
  readonly insets: Insets;
  readonly zoom: ZoomRange;
  /** How many pixels of the board always stay on screen. */
  readonly keep: number;
}

/** The editor's fit insets on a notebook (DESIGN.md 7). */
export const EDITOR_INSETS: Insets = { top: 80, right: 72, bottom: 108, left: 72 };

/** The editor's fit insets on a phone, in view mode (DESIGN.md 7). */
export const EDITOR_PHONE_INSETS: Insets = { top: 72, right: 12, bottom: 88, left: 12 };

/** The editor's fit insets on a phone, in edit mode, above the tools island (DESIGN.md 7). */
export const EDITOR_PHONE_EDIT_INSETS: Insets = { top: 72, right: 12, bottom: 84, left: 12 };

/** The editor's zoom range: half the fit to ten times it. */
export const EDITOR_ZOOM: ZoomRange = { min: 0.5, max: 10 };

/** How many pixels of the board the editor keeps on screen while panning. */
export const EDITOR_KEEP = 96;

/** `value` within `low` and `high`, whichever order they come in. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));
}

/** The screen point of a world point. */
export function toScreen(camera: Camera, point: WorldPoint): ScreenPoint {
  return { x: camera.x + point.x * camera.k, y: camera.y + point.y * camera.k };
}

/** The world point under a screen point. */
export function toWorld(camera: Camera, point: ScreenPoint): WorldPoint {
  return { x: (point.x - camera.x) / camera.k, y: (point.y - camera.y) / camera.k };
}

/** The part of the world the viewport shows. */
export function visibleWorld(camera: Camera, viewport: ViewportSize): WorldRect {
  const corner = toWorld(camera, { x: 0, y: 0 });
  return {
    x: corner.x,
    y: corner.y,
    width: viewport.width / camera.k,
    height: viewport.height / camera.k,
  };
}

/** The camera that shows `rect` as large as fits between the insets, centred between them. */
export function fitCamera(rect: WorldRect, viewport: ViewportSize, insets: Insets): Camera {
  const room = {
    width: Math.max(1, viewport.width - insets.left - insets.right),
    height: Math.max(1, viewport.height - insets.top - insets.bottom),
  };
  const k = Math.min(room.width / rect.width, room.height / rect.height);
  return {
    k,
    x: insets.left + (room.width - rect.width * k) / 2 - rect.x * k,
    y: insets.top + (room.height - rect.height * k) / 2 - rect.y * k,
  };
}

/**
 * The limits of one board: fitted between the insets, zoomed within the range, and panned so that
 * at least `keep` pixels of the board stay on screen on each axis.
 */
export function boardLimits(view: BoardView): CameraLimits {
  const { board, viewport, keep } = view;
  return {
    viewport,
    fit: fitCamera(board, viewport, view.insets),
    zoom: view.zoom,
    place: (camera) => ({
      k: camera.k,
      x: clamp(
        camera.x,
        keep - (board.x + board.width) * camera.k,
        viewport.width - keep - board.x * camera.k
      ),
      y: clamp(
        camera.y,
        keep - (board.y + board.height) * camera.k,
        viewport.height - keep - board.y * camera.k
      ),
    }),
  };
}

/** How many times the fit the camera is zoomed. */
export function zoomOf(camera: Camera, limits: CameraLimits): number {
  return camera.k / limits.fit.k;
}

function allowedZoom(k: number, limits: CameraLimits): number {
  return clamp(k, limits.fit.k * limits.zoom.min, limits.fit.k * limits.zoom.max);
}

/** The camera within the limits: its zoom inside the range, then panned into place. */
export function constrainCamera(camera: Camera, limits: CameraLimits): Camera {
  return limits.place({ ...camera, k: allowedZoom(camera.k, limits) });
}

/** Zooms by `factor` keeping the world point under `at` where it is, within the limits. */
export function zoomAround(
  camera: Camera,
  factor: number,
  at: ScreenPoint,
  limits: CameraLimits
): Camera {
  const k = allowedZoom(camera.k * factor, limits);
  const anchor = toWorld(camera, at);
  return limits.place({ k, x: at.x - anchor.x * k, y: at.y - anchor.y * k });
}

/** Moves the world by `dx`, `dy` screen pixels, within the limits. */
export function panCamera(camera: Camera, dx: number, dy: number, limits: CameraLimits): Camera {
  return constrainCamera({ ...camera, x: camera.x + dx, y: camera.y + dy }, limits);
}

/** Puts a world point at the centre of the viewport, keeping the zoom, within the limits. */
export function centerOn(camera: Camera, point: WorldPoint, limits: CameraLimits): Camera {
  return constrainCamera(
    {
      k: camera.k,
      x: limits.viewport.width / 2 - point.x * camera.k,
      y: limits.viewport.height / 2 - point.y * camera.k,
    },
    limits
  );
}

/** Two pointers on screen, as a pinch sees them. */
export type PointerPair = readonly [ScreenPoint, ScreenPoint];

function midpoint([a, b]: PointerPair): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function spread([a, b]: PointerPair): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The camera of a pinch: the world point that was under the first midpoint follows the midpoint,
 * and the zoom follows the distance between the fingers, within the limits.
 *
 * @param start The camera when the second finger went down.
 * @param from The two pointers then.
 * @param to The two pointers now.
 */
export function pinchCamera(
  start: Camera,
  from: PointerPair,
  to: PointerPair,
  limits: CameraLimits
): Camera {
  const before = spread(from);
  const ratio = before > 0 ? spread(to) / before : 1;
  const k = allowedZoom(start.k * ratio, limits);
  const anchor = toWorld(start, midpoint(from));
  const now = midpoint(to);
  return limits.place({ k, x: now.x - anchor.x * k, y: now.y - anchor.y * k });
}

/**
 * The cameras of a flight from `from` to `to` (DESIGN.md 8), as a function of eased progress.
 * The centre of `anchor` moves on a straight line on screen and its size changes geometrically,
 * `k(e) = k0 × (k1 / k0)^e`, so the anchored board travels without swinging.
 */
export function flightPath(from: Camera, to: Camera, anchor: WorldRect): (eased: number) => Camera {
  const center = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  const start = toScreen(from, center);
  const end = toScreen(to, center);

  return (eased) => {
    if (eased >= 1) {
      return to;
    }

    const k = from.k * (to.k / from.k) ** eased;
    const x = start.x + (end.x - start.x) * eased;
    const y = start.y + (end.y - start.y) * eased;
    return { k, x: x - center.x * k, y: y - center.y * k };
  };
}

function revealAxis(start: number, end: number, low: number, high: number): number {
  if (end - start > high - low || start < low) {
    return low - start;
  }

  return end > high ? high - end : 0;
}

/**
 * The camera moved as little as needed to bring `rect` inside the insets, as when the keyboard
 * focuses an artboard off screen; its top-left corner wins when it does not fit.
 */
export function revealCamera(
  camera: Camera,
  rect: WorldRect,
  viewport: ViewportSize,
  insets: Insets
): Camera {
  const left = camera.x + rect.x * camera.k;
  const top = camera.y + rect.y * camera.k;
  return {
    k: camera.k,
    x:
      camera.x +
      revealAxis(left, left + rect.width * camera.k, insets.left, viewport.width - insets.right),
    y:
      camera.y +
      revealAxis(top, top + rect.height * camera.k, insets.top, viewport.height - insets.bottom),
  };
}

/**
 * The camera that shows the world rectangle `rect` exactly over the screen rectangle `on`, as at
 * the start of the flight into a maze, the board over the thumbnail it was opened from.
 */
export function cameraOnto(rect: WorldRect, on: WorldRect): Camera {
  const k = on.width / rect.width;
  return { k, x: on.x - rect.x * k, y: on.y - rect.y * k };
}
