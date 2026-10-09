/**
 * What the editor draws over the track, as path data, in the order it is painted (DESIGN.md
 * 2.3): the session diff, the selected finding, the selection, the edge preview and the keyboard
 * cursor. Every size is a fraction of the cell pitch, so the overlays scale with the board.
 *
 * @module
 */

import {
  sameCell,
  type Cell,
  type CellArea,
  type Edge,
  type Finding,
  type MazeDiff,
  type Post,
} from '@/maze';

import { cellRect, slotRect, toBoardPoint, type BoardGeometry, type BoardRect } from './geometry';
import { circlePath, rectPath, roundedRectPath } from './path';

/** The places a finding points at. */
export type FindingFocus = Pick<Finding, 'cells' | 'edges' | 'posts'>;

/** The edge under the pointer and whether the gesture would take its wall away. */
export interface EdgePreview {
  readonly edge: Edge;
  readonly removes: boolean;
}

/** What to draw over the track; anything left out is not drawn. */
export interface BoardOverlays {
  readonly diff?: MazeDiff;
  readonly focus?: FindingFocus;
  readonly selection?: CellArea;
  readonly preview?: EdgePreview;
  readonly cursor?: Cell;
}

/** Path data of the diff: walls put, marks set, and what was taken or unmarked. */
export interface DiffLayers {
  /** Walls put, outlined and lightly filled. */
  readonly added: string;
  /** Rings where the start or a goal is now. */
  readonly marked: string;
  /** Walls taken and rings where the start or a goal was, outlined with a dash. */
  readonly dashed: string;
}

/** Path data of every overlay; an empty string draws nothing. */
export interface OverlayLayers {
  readonly diff: DiffLayers;
  /** Cells of the finding, outlined, when it points at no edge and no post. */
  readonly focusOutline: string;
  /** Edges and posts of the finding, outlined and lightly filled. */
  readonly focusArea: string;
  readonly selection: string;
  readonly preview: string;
  /** Whether the preview shows a wall being taken away rather than put. */
  readonly previewRemoves: boolean;
  readonly cursor: string;
}

/** A dash pattern: the length drawn, then the gap. */
export type Dash = readonly [on: number, off: number];

/** The line widths and dashes of the overlays, in board units. */
export interface OverlayStrokes {
  readonly diff: number;
  readonly diffDash: Dash;
  readonly focus: number;
  readonly selection: number;
  readonly selectionDash: Dash;
  readonly preview: number;
  readonly previewRemoveDash: Dash;
  readonly cursor: number;
}

const DIFF_PAD = 0.07;
const DIFF_RADIUS = 0.07;
const MARK_SIDE = 0.68;
const MARK_RADIUS = 0.12;
const FOCUS_CELL_INSET = 0.12;
const FOCUS_EDGE_PAD = 0.1;
const FOCUS_RADIUS = 0.08;
const FOCUS_POST_RADIUS = 0.3;
const CURSOR_GAP = 0.08;
const CURSOR_RADIUS = 0.08;

/** The line widths and dashes of the overlays drawn with `geometry`. */
export function overlayStrokes(geometry: BoardGeometry): OverlayStrokes {
  const p = geometry.pitch;
  const dash = (on: number, off: number): Dash => [on * p, off * p];
  return {
    diff: geometry.diffStroke,
    diffDash: dash(0.09, 0.07),
    focus: 0.045 * p,
    selection: 0.03 * p,
    selectionDash: dash(0.12, 0.1),
    preview: 0.025 * p,
    previewRemoveDash: dash(0.07, 0.05),
    cursor: 0.05 * p,
  };
}

function inset(rect: BoardRect, amount: number): BoardRect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    width: rect.width - 2 * amount,
    height: rect.height - 2 * amount,
  };
}

function markRing(geometry: BoardGeometry, cell: Cell): string {
  const rect = inset(cellRect(geometry, cell), (geometry.pitch * (1 - MARK_SIDE)) / 2);
  return roundedRectPath(rect, geometry.pitch * MARK_RADIUS);
}

/** The diff drawn with `geometry`. */
export function diffLayers(geometry: BoardGeometry, diff: MazeDiff): DiffLayers {
  const p = geometry.pitch;
  const slot = (edge: Edge): string =>
    roundedRectPath(slotRect(geometry, edge, DIFF_PAD * p), DIFF_RADIUS * p);
  const startMoved = !sameCell(diff.startBefore, diff.startAfter);
  const markedCells = [...diff.goalsAdded];
  const unmarkedCells = [...diff.goalsRemoved];

  if (startMoved && diff.startAfter !== undefined) {
    markedCells.push(diff.startAfter);
  }

  if (startMoved && diff.startBefore !== undefined) {
    unmarkedCells.push(diff.startBefore);
  }

  return {
    added: diff.added.map(slot).join(''),
    marked: markedCells.map((cell) => markRing(geometry, cell)).join(''),
    dashed: [
      ...diff.removed.map(slot),
      ...unmarkedCells.map((cell) => markRing(geometry, cell)),
    ].join(''),
  };
}

function focusLayers(
  geometry: BoardGeometry,
  focus: FindingFocus | undefined
): Pick<OverlayLayers, 'focusOutline' | 'focusArea'> {
  if (focus === undefined) {
    return { focusOutline: '', focusArea: '' };
  }

  const p = geometry.pitch;
  const onlyCells = focus.edges.length === 0 && focus.posts.length === 0;
  const post = (corner: Post): string => {
    const center = toBoardPoint(geometry, { u: corner.x, v: corner.y });
    return circlePath(center.x, center.y, FOCUS_POST_RADIUS * p);
  };

  return {
    focusOutline: onlyCells
      ? focus.cells
          .map((cell) =>
            roundedRectPath(inset(cellRect(geometry, cell), FOCUS_CELL_INSET * p), FOCUS_RADIUS * p)
          )
          .join('')
      : '',
    focusArea: [
      ...focus.edges.map((edge) =>
        roundedRectPath(slotRect(geometry, edge, FOCUS_EDGE_PAD * p), FOCUS_RADIUS * p)
      ),
      ...focus.posts.map(post),
    ].join(''),
  };
}

function selectionPath(geometry: BoardGeometry, area: CellArea | undefined): string {
  if (area === undefined) {
    return '';
  }

  const southWest = cellRect(geometry, {
    x: Math.min(area.from.x, area.to.x),
    y: Math.min(area.from.y, area.to.y),
  });
  const northEast = cellRect(geometry, {
    x: Math.max(area.from.x, area.to.x),
    y: Math.max(area.from.y, area.to.y),
  });
  return rectPath({
    x: southWest.x,
    y: northEast.y,
    width: northEast.x + northEast.width - southWest.x,
    height: southWest.y + southWest.height - northEast.y,
  });
}

function cursorPath(geometry: BoardGeometry, cell: Cell | undefined): string {
  if (cell === undefined) {
    return '';
  }

  const gap = geometry.wall / 2 + CURSOR_GAP * geometry.pitch;
  return roundedRectPath(inset(cellRect(geometry, cell), gap), CURSOR_RADIUS * geometry.pitch);
}

/** The overlays drawn with `geometry`. */
export function overlayLayers(geometry: BoardGeometry, overlays: BoardOverlays): OverlayLayers {
  const { preview } = overlays;
  return {
    diff:
      overlays.diff === undefined
        ? { added: '', marked: '', dashed: '' }
        : diffLayers(geometry, overlays.diff),
    ...focusLayers(geometry, overlays.focus),
    selection: selectionPath(geometry, overlays.selection),
    preview: preview === undefined ? '' : rectPath(slotRect(geometry, preview.edge)),
    previewRemoves: preview?.removes ?? false,
    cursor: cursorPath(geometry, overlays.cursor),
  };
}
