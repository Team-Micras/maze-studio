/**
 * The library as a canvas (DESIGN.md 7): every maze an artboard 640 world units on its longest
 * side, in a grid read left to right, its camera fitted to the grid's width and scrolling down,
 * and which rows a viewport needs mounted.
 *
 * @module
 */

import {
  clamp,
  type Camera,
  type CameraLimits,
  type Insets,
  type ViewportSize,
  type WorldPoint,
  type WorldRect,
  type ZoomRange,
} from './camera';
import { ARTBOARD_SIZE } from './geometry';

/** The world gap between two artboards of a row. */
export const ARTBOARD_GAP_X = 200;

/** The world gap between two rows, room for the labels above the artboards. */
export const ARTBOARD_GAP_Y = 210;

/** The room left for the library's islands around the fitted grid. */
export const LIBRARY_INSETS: Readonly<Record<'notebook' | 'phone', Insets>> = {
  notebook: { top: 112, right: 56, bottom: 72, left: 56 },
  phone: { top: 150, right: 14, bottom: 56, left: 14 },
};

/** The library's zoom range: half the fit to four times it. */
export const LIBRARY_ZOOM: ZoomRange = { min: 0.5, max: 4 };

const COLUMN_WIDTH = { notebook: 250, phone: 170 } as const;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 6;
const COLUMN_ALLOWANCE = 32;
const ROW_PITCH = ARTBOARD_SIZE + ARTBOARD_GAP_Y;
const COLUMN_PITCH = ARTBOARD_SIZE + ARTBOARD_GAP_X;

/** The size of a maze, in cells. */
export interface MazeSize {
  readonly width: number;
  readonly height: number;
}

/** The artboards placed in a grid, and the grid's size in world units. */
export interface LibraryGrid {
  readonly columns: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** Where each artboard is, in the order given. */
  readonly places: readonly WorldRect[];
}

/** A range of rows, both ends included; empty when `first` is past `last`. */
export interface RowRange {
  readonly first: number;
  readonly last: number;
}

/** How many columns a viewport this wide shows: 2 to 6. */
export function libraryColumns(viewportWidth: number, layout: 'notebook' | 'phone'): number {
  return clamp(
    Math.floor((viewportWidth - COLUMN_ALLOWANCE) / COLUMN_WIDTH[layout]),
    MIN_COLUMNS,
    MAX_COLUMNS
  );
}

/** The top-left corner of the square cell of the grid at `index`, 640 world units a side. */
export function cellOf(index: number, columns: number): WorldPoint {
  return {
    x: (index % columns) * COLUMN_PITCH,
    y: Math.floor(index / columns) * ROW_PITCH,
  };
}

/**
 * Where an artboard of `size` lies in the cell at `cell`: its longest side 640 units, centred
 * across the cell and standing on its bottom.
 */
export function artboardIn(cell: WorldPoint, size: MazeSize): WorldRect {
  const longest = Math.max(size.width, size.height);
  const width = (ARTBOARD_SIZE * size.width) / longest;
  const height = (ARTBOARD_SIZE * size.height) / longest;
  return {
    x: cell.x + (ARTBOARD_SIZE - width) / 2,
    y: cell.y + (ARTBOARD_SIZE - height),
    width,
    height,
  };
}

/** The grid of `sizes`, left to right and then down, `columns` to a row. */
export function libraryGrid(sizes: readonly MazeSize[], columns: number): LibraryGrid {
  const rows = Math.max(1, Math.ceil(sizes.length / columns));
  return {
    columns,
    rows,
    width: columns * ARTBOARD_SIZE + (columns - 1) * ARTBOARD_GAP_X,
    height: rows * ARTBOARD_SIZE + (rows - 1) * ARTBOARD_GAP_Y,
    places: sizes.map((size, index) => artboardIn(cellOf(index, columns), size)),
  };
}

/** The row an artboard of the grid is in. */
export function rowOf(index: number, grid: Pick<LibraryGrid, 'columns'>): number {
  return Math.floor(index / grid.columns);
}

/**
 * The limits of the library's camera: the fit puts the grid's width between the side insets with
 * its top at the top inset; zoomed out past the room, the grid is centred, otherwise it pans
 * within the insets, and a grid shorter than the room stays at the top.
 */
export function libraryLimits(
  grid: Pick<LibraryGrid, 'width' | 'height'>,
  viewport: ViewportSize,
  insets: Insets,
  zoom: ZoomRange = LIBRARY_ZOOM
): CameraLimits {
  const room = {
    width: Math.max(1, viewport.width - insets.left - insets.right),
    height: Math.max(1, viewport.height - insets.top - insets.bottom),
  };
  return {
    viewport,
    fit: { k: room.width / grid.width, x: insets.left, y: insets.top },
    zoom,
    place: (camera) => {
      const width = grid.width * camera.k;
      const height = grid.height * camera.k;
      return {
        k: camera.k,
        x:
          width <= room.width
            ? (viewport.width - width) / 2
            : clamp(camera.x, viewport.width - insets.right - width, insets.left),
        y:
          height <= room.height
            ? insets.top
            : clamp(camera.y, viewport.height - insets.bottom - height, insets.top),
      };
    },
  };
}

/**
 * The rows a viewport shows, with one more above and one more below, within the grid. These are
 * the rows the library keeps mounted.
 */
export function mountedRows(
  camera: Camera,
  viewport: ViewportSize,
  grid: Pick<LibraryGrid, 'rows'>
): RowRange {
  const top = -camera.y / camera.k;
  const bottom = (viewport.height - camera.y) / camera.k;
  const firstShown = Math.floor((top - ARTBOARD_SIZE) / ROW_PITCH) + 1;
  const lastShown = Math.ceil(bottom / ROW_PITCH) - 1;
  return { first: Math.max(0, firstShown - 1), last: Math.min(grid.rows - 1, lastShown + 1) };
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
