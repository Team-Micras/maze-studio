/**
 * The library as a grid on the page (DESIGN.md 7): every maze a thumbnail in a square slot, the
 * slots in columns that follow the viewport's width, read left to right and scrolled by the
 * browser; which rows a scroll position needs mounted; and the scroll that brings a slot into
 * view. Lengths are CSS pixels on the page, from its top-left corner.
 *
 * @module
 */

import { clamp, type Insets, type WorldPoint, type WorldRect } from './camera';
import { ARTBOARD_SIZE } from './geometry';

/** The gap between two slots of a row, as a share of the slot's side. */
export const SLOT_GAP_X = 200 / ARTBOARD_SIZE;

/** The gap between two rows, room for the name above each slot, as a share of the slot's side. */
export const SLOT_GAP_Y = 210 / ARTBOARD_SIZE;

/** The room left for the library's islands around the grid. */
export const LIBRARY_INSETS: Readonly<Record<'notebook' | 'phone', Insets>> = {
  notebook: { top: 112, right: 56, bottom: 72, left: 56 },
  phone: { top: 150, right: 14, bottom: 56, left: 14 },
};

/**
 * The narrowest notebook whose top islands fit on one row with the Changes chip; a narrower one
 * puts the search and filters on a second row, which the grid leaves room for.
 */
export const ONE_ROW_TOP_BAR_WIDTH = 1280;

const SECOND_ROW = 52;

function libraryInsets(viewportWidth: number, layout: 'notebook' | 'phone'): Insets {
  const insets = LIBRARY_INSETS[layout];
  return layout === 'notebook' && viewportWidth < ONE_ROW_TOP_BAR_WIDTH
    ? { ...insets, top: insets.top + SECOND_ROW }
    : insets;
}

const COLUMN_WIDTH = { notebook: 250, phone: 170 } as const;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 6;
const COLUMN_ALLOWANCE = 32;

/** The size of a maze, in cells. */
export interface MazeSize {
  readonly width: number;
  readonly height: number;
}

/** The grid of the library on the page. */
export interface LibraryLayout {
  readonly columns: number;
  readonly rows: number;
  /** The side of a square slot. */
  readonly side: number;
  /** The distance from one column's left edge to the next one's. */
  readonly columnPitch: number;
  /** The distance from one row's top edge to the next one's. */
  readonly rowPitch: number;
  /** The insets the grid keeps from the viewport's edges. */
  readonly insets: Insets;
  /** The page's height: the grid and its insets. */
  readonly height: number;
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

/** The grid of `count` mazes in a viewport `viewportWidth` wide. */
export function libraryLayout(
  viewportWidth: number,
  layout: 'notebook' | 'phone',
  count: number
): LibraryLayout {
  const insets = libraryInsets(viewportWidth, layout);
  const columns = libraryColumns(viewportWidth, layout);
  const room = Math.max(1, viewportWidth - insets.left - insets.right);
  const side = room / (columns + (columns - 1) * SLOT_GAP_X);
  const rows = Math.max(1, Math.ceil(count / columns));
  const rowPitch = side * (1 + SLOT_GAP_Y);
  return {
    columns,
    rows,
    side,
    columnPitch: side * (1 + SLOT_GAP_X),
    rowPitch,
    insets,
    height: insets.top + rows * side + (rows - 1) * side * SLOT_GAP_Y + insets.bottom,
  };
}

/**
 * Where a maze of `size` lies in a square slot of `side` whose top-left corner is `corner`: its
 * longest side the slot's, centred across it and standing on its bottom.
 */
export function artboardIn(corner: WorldPoint, size: MazeSize, side = ARTBOARD_SIZE): WorldRect {
  const longest = Math.max(size.width, size.height);
  const width = (side * size.width) / longest;
  const height = (side * size.height) / longest;
  return { x: corner.x + (side - width) / 2, y: corner.y + (side - height), width, height };
}

/** Where the thumbnail of the maze at `index`, of `size`, lies on the page. */
export function libraryRect(layout: LibraryLayout, index: number, size: MazeSize): WorldRect {
  const corner = {
    x: layout.insets.left + (index % layout.columns) * layout.columnPitch,
    y: layout.insets.top + Math.floor(index / layout.columns) * layout.rowPitch,
  };
  return artboardIn(corner, size, layout.side);
}

/** The row the maze at `index` is in. */
export function rowOf(index: number, layout: Pick<LibraryLayout, 'columns'>): number {
  return Math.floor(index / layout.columns);
}

/**
 * The rows a viewport `height` tall scrolled to `scrollTop` shows, with one more above and one
 * more below, within the grid: the rows the library keeps mounted.
 */
export function mountedRows(layout: LibraryLayout, scrollTop: number, height: number): RowRange {
  const top = scrollTop - layout.insets.top;
  const bottom = top + height;
  const firstShown = Math.floor((top - layout.side) / layout.rowPitch) + 1;
  const lastShown = Math.ceil(bottom / layout.rowPitch) - 1;
  return {
    first: Math.max(0, firstShown - 1),
    last: Math.min(layout.rows - 1, lastShown + 1),
  };
}

/**
 * The scroll position that brings `rect` inside the insets of a viewport `height` tall, moving as
 * little as needed from `scrollTop`; its top wins when it does not fit.
 */
export function revealScroll(
  rect: Pick<WorldRect, 'y' | 'height'>,
  scrollTop: number,
  height: number,
  insets: Insets
): number {
  const low = scrollTop + insets.top;
  const high = scrollTop + height - insets.bottom;

  if (rect.height > high - low || rect.y < low) {
    return Math.max(0, rect.y - insets.top);
  }

  return rect.y + rect.height > high ? rect.y + rect.height - height + insets.bottom : scrollTop;
}
