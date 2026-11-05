/**
 * What the editor draws over the track, as path data, in the order it is painted (DESIGN.md
 * 2.3): the walls the search has not seen yet, the session diff, the search's trail, the shortest
 * routes, the robot, the selected finding, the selection, the edge
 * preview and the keyboard cursor. Every size is a fraction of the cell pitch, so the overlays
 * scale with the board.
 *
 * @module
 */

import {
  sameCell,
  type Cell,
  type CellArea,
  type Edge,
  type Exploration,
  type Finding,
  type MazeDiff,
  type Post,
  type RoutePoint,
  type ShortestRoutes,
} from '@/maze';

import {
  cellRect,
  slotRect,
  toBoardPoint,
  type BoardGeometry,
  type BoardPoint,
  type BoardRect,
} from './geometry';
import { circlePath, formatLength, rectPath, roundedRectPath } from './path';

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
  /** The shortest routes shown; a route left out is not drawn. */
  readonly routes?: Partial<ShortestRoutes>;
  /** The flood-fill search whose trail is drawn under the routes. */
  readonly exploration?: Exploration;
  /**
   * How far the search is played, in moves from the start; left out, its whole trail is drawn
   * still. While it plays, the robot and the walls it has not seen yet are drawn too.
   */
  readonly explorationAt?: number;
  readonly focus?: FindingFocus;
  readonly selection?: CellArea;
  readonly preview?: EdgePreview;
  readonly cursor?: Cell;
}

/** The shortest routes and the flood-fill search drawn over a maze, as the session's switches pick. */
export type RouteOverlays = Pick<BoardOverlays, 'routes' | 'exploration'>;

/** Path data of the diff: walls put, marks set, and what was taken or unmarked. */
export interface DiffLayers {
  /** Walls put, outlined and lightly filled. */
  readonly added: string;
  /** Rings where the start or a goal is now. */
  readonly marked: string;
  /** Walls taken and rings where the start or a goal was, outlined with a dash. */
  readonly dashed: string;
}

/** Path data of a route: its line through the centres and wall middles, and the dot at its goal. */
export interface RouteLayers {
  /** From a little past the start chevron, so as not to cover it, to the goal cell's centre. */
  readonly line: string;
  /** A dot on the goal cell's centre. */
  readonly goal: string;
  /** The floor-coloured disc under the goal dot and its own line, as wide around the dot as the casing is around the line. */
  readonly goalCasing: string;
}

/** Path data of every overlay; an empty string draws nothing. */
export interface OverlayLayers {
  /** The walls the search has not seen yet while it plays, as their places between the posts. */
  readonly unseen: string;
  readonly diff: DiffLayers;
  /** The trail of the search, drawn like a route; while it plays, without the goal dot. */
  readonly exploration: RouteLayers | undefined;
  /** The routes shown, in the order they are painted: with diagonals on top. */
  readonly routes: readonly (RouteLayers & {
    readonly name: keyof ShortestRoutes;
  })[];
  /** Cells of the finding, outlined, when it points at no edge and no post. */
  readonly focusOutline: string;
  /** Edges and posts of the finding, outlined and lightly filled. */
  readonly focusArea: string;
  readonly selection: string;
  readonly preview: string;
  /** Whether the preview shows a wall being taken away rather than put. */
  readonly previewRemoves: boolean;
  readonly cursor: string;
  /** A triangle on the robot of the search while it plays, pointing the way it moves. */
  readonly robot: string;
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
  readonly route: number;
  /** The floor-coloured casing under a route, wider than the route by this much. */
  readonly routeCasing: number;
  /** The floor-coloured outline of the robot. */
  readonly robot: number;
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
const ROUTE_WIDTH = 0.085;
const ROUTE_CORNER = 0.1;
const ROUTE_LEAVE = 0.35;
const ROUTE_GOAL_RADIUS = 0.1;
const ROUTE_CASING = 0.06;
const ROUTE_ORDER = ['withoutDiagonals', 'withDiagonals'] as const;

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
    route: ROUTE_WIDTH * p,
    routeCasing: (ROUTE_WIDTH + ROUTE_CASING) * p,
    robot: 0.06 * p,
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

function reversing(before: BoardPoint, at: BoardPoint, after: BoardPoint): boolean {
  return (at.x - before.x) * (after.x - at.x) + (at.y - before.y) * (after.y - at.y) < 0;
}

function turning(before: BoardPoint, at: BoardPoint, after: BoardPoint): boolean {
  return (
    Math.abs((at.x - before.x) * (after.y - at.y) - (at.y - before.y) * (after.x - at.x)) > 1e-6 ||
    reversing(before, at, after)
  );
}

/**
 * The line through `points` drawn with `geometry`: straight runs and 45° diagonals between them,
 * each corner softened by a small fixed radius for looks only, and a turn back sharp, so that the
 * line goes back over itself.
 */
function routeLayers(geometry: BoardGeometry, points: readonly RoutePoint[]): RouteLayers {
  const f = formatLength;
  const all = points.map((point) => toBoardPoint(geometry, point));
  const corners = all.filter(
    (point, index) =>
      index === 0 || index === all.length - 1 || turning(all[index - 1], point, all[index + 1])
  );
  const toward = (from: BoardPoint, to: BoardPoint, distance: number): string => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return `${f(from.x + ((to.x - from.x) * distance) / length)} ${f(from.y + ((to.y - from.y) * distance) / length)}`;
  };
  const bends = corners.slice(1, -1).map((corner, index) => {
    const before = corners[index];
    const after = corners[index + 2];

    if (reversing(before, corner, after)) {
      return `L${f(corner.x)} ${f(corner.y)}`;
    }

    const radius = Math.min(
      ROUTE_CORNER * geometry.pitch,
      Math.hypot(corner.x - before.x, corner.y - before.y) / 2,
      Math.hypot(after.x - corner.x, after.y - corner.y) / 2
    );
    return `L${toward(corner, before, radius)}Q${f(corner.x)} ${f(corner.y)} ${toward(corner, after, radius)}`;
  });
  const first = all[0];
  const last = all[all.length - 1];
  return {
    line: `M${toward(first, all[1], ROUTE_LEAVE * geometry.pitch)}${bends.join('')}L${f(last.x)} ${f(last.y)}`,
    goal: circlePath(last.x, last.y, ROUTE_GOAL_RADIUS * geometry.pitch),
    goalCasing: circlePath(last.x, last.y, (ROUTE_GOAL_RADIUS + ROUTE_CASING / 2) * geometry.pitch),
  };
}

const ROBOT_NOSE = 0.3;
const ROBOT_TAIL = 0.2;
const ROBOT_HALF_WIDTH = 0.22;
const HEADINGS = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
} as const;

const centre = (cell: Cell): RoutePoint => ({ u: cell.x + 0.5, v: cell.y + 0.5 });

function explorationLayers(
  geometry: BoardGeometry,
  exploration: Exploration | undefined,
  at: number | undefined
): Pick<OverlayLayers, 'unseen' | 'exploration' | 'robot'> {
  if (exploration === undefined) {
    return { unseen: '', exploration: undefined, robot: '' };
  }

  const { steps } = exploration;

  if (at === undefined) {
    return { unseen: '', exploration: routeLayers(geometry, steps.map(centre)), robot: '' };
  }

  const step = Math.min(Math.floor(at), steps.length - 1);
  const here = steps[step];
  const next = steps[Math.min(step + 1, steps.length - 1)];
  const part = at - step;
  const robot = {
    u: here.x + 0.5 + (next.x - here.x) * part,
    v: here.y + 0.5 + (next.y - here.y) * part,
  };
  const trail = [...steps.slice(0, step + 1).map(centre), ...(part > 0 ? [robot] : [])];
  const p = geometry.pitch;
  const tip = toBoardPoint(geometry, robot);
  const [dx, dy] = HEADINGS[part > 0 ? next.heading : here.heading];
  const corner = (forward: number, side: number): string =>
    `${formatLength(tip.x + (dx * forward - dy * side) * p)} ${formatLength(tip.y + (dy * forward + dx * side) * p)}`;

  return {
    unseen: exploration.walls
      .filter((wall) => wall.seenAt > step)
      .map((wall) => rectPath(slotRect(geometry, wall)))
      .join(''),
    exploration:
      trail.length < 2 ? undefined : { ...routeLayers(geometry, trail), goal: '', goalCasing: '' },
    robot: `M${corner(ROBOT_NOSE, 0)}L${corner(-ROBOT_TAIL, ROBOT_HALF_WIDTH)}L${corner(-ROBOT_TAIL, -ROBOT_HALF_WIDTH)}Z`,
  };
}

/** The overlays drawn with `geometry`. */
export function overlayLayers(geometry: BoardGeometry, overlays: BoardOverlays): OverlayLayers {
  const { preview } = overlays;
  return {
    ...explorationLayers(geometry, overlays.exploration, overlays.explorationAt),
    diff:
      overlays.diff === undefined
        ? { added: '', marked: '', dashed: '' }
        : diffLayers(geometry, overlays.diff),
    routes: ROUTE_ORDER.flatMap((name) => {
      const route = overlays.routes?.[name];
      return route === undefined ? [] : [{ name, ...routeLayers(geometry, route.points) }];
    }),
    ...focusLayers(geometry, overlays.focus),
    selection: selectionPath(geometry, overlays.selection),
    preview: preview === undefined ? '' : rectPath(slotRect(geometry, preview.edge)),
    previewRemoves: preview?.removes ?? false,
    cursor: cursorPath(geometry, overlays.cursor),
  };
}
