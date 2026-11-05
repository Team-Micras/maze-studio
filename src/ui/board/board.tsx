import { memo, useMemo, type CSSProperties } from 'react';

import type { Maze } from '@/maze';
import {
  ARTBOARD_SIZE,
  boardGeometry,
  EXPLORATION_COLOR,
  formatLength,
  overlayLayers,
  overlayStrokes,
  ROUTE_COLORS,
  TRACK_COLORS,
  TRACK_OPACITY,
  trackPaint,
  type BoardGeometry,
  type BoardOverlays,
  type OverlayStrokes,
  type RouteLayers,
} from '@/render';
import { cn } from '@/ui/primitives/utils';

/** The props of {@link Board}. */
export interface BoardProps {
  readonly maze: Maze;
  /** What the editor draws over the track; nothing by default. */
  readonly overlays?: BoardOverlays;
  /** The longest side of the board, in world units; {@link ARTBOARD_SIZE} by default. */
  readonly size?: number;
  /** What a screen reader calls it; without one it is decorative, hidden from screen readers. */
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const NO_OVERLAYS: BoardOverlays = {};

const ROUND = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

interface LayerProps {
  readonly name: string;
  readonly d: string;
  readonly fill?: string;
  readonly fillOpacity?: number;
  readonly stroke?: string;
  readonly strokeOpacity?: number;
  readonly strokeWidth?: number;
  readonly strokeDasharray?: readonly number[];
  readonly strokeLinecap?: 'round';
  readonly strokeLinejoin?: 'round';
}

function Layer({ name, d, fill = 'none', strokeDasharray, ...paint }: LayerProps) {
  if (d === '') {
    return null;
  }

  return (
    <path
      d={d}
      data-layer={name}
      fill={fill}
      strokeDasharray={strokeDasharray?.join(' ')}
      {...paint}
    />
  );
}

const Track = memo(function Track({
  maze,
  geometry,
}: {
  readonly maze: Maze;
  readonly geometry: BoardGeometry;
}) {
  return (
    <g data-group="track">
      {trackPaint(maze, geometry).map((layer) => (
        <Layer key={layer.name} {...layer} />
      ))}
    </g>
  );
});

function RouteGroup({
  name,
  route,
  color,
  strokes,
}: {
  readonly name: string;
  readonly route: RouteLayers;
  readonly color: string;
  readonly strokes: OverlayStrokes;
}) {
  return (
    <g data-route={name}>
      <Layer
        d={route.line}
        name="route-casing"
        stroke={TRACK_COLORS.floor}
        strokeOpacity={TRACK_OPACITY.routeCasing}
        strokeWidth={strokes.routeCasing}
        {...ROUND}
      />
      <Layer
        d={route.goalCasing}
        fill={TRACK_COLORS.floor}
        fillOpacity={TRACK_OPACITY.routeCasing}
        name="route-goal-casing"
      />
      <Layer d={route.line} name="route" stroke={color} strokeWidth={strokes.route} {...ROUND} />
      <Layer d={route.goal} fill={color} name="route-goal" />
    </g>
  );
}

function Overlays({
  overlays,
  geometry,
}: {
  readonly overlays: BoardOverlays;
  readonly geometry: BoardGeometry;
}) {
  const layers = overlayLayers(geometry, overlays);
  const strokes = overlayStrokes(geometry);
  const playing = overlays.explorationAt !== undefined;
  const shortest = (
    <g data-group="routes" opacity={playing ? TRACK_OPACITY.routesWhilePlaying : undefined}>
      {layers.routes.map((route) => (
        <RouteGroup
          color={ROUTE_COLORS[route.name]}
          key={route.name}
          name={route.name}
          route={route}
          strokes={strokes}
        />
      ))}
    </g>
  );
  const diff = { stroke: TRACK_COLORS.diff, strokeWidth: strokes.diff };
  const preview = layers.previewRemoves
    ? {
        fill: TRACK_COLORS.floor,
        stroke: TRACK_COLORS.cursor,
        strokeWidth: strokes.preview,
        strokeDasharray: strokes.previewRemoveDash,
      }
    : {
        fill: TRACK_COLORS.wall,
        fillOpacity: TRACK_OPACITY.previewFill,
        stroke: TRACK_COLORS.cursor,
        strokeOpacity: TRACK_OPACITY.previewOutline,
        strokeWidth: strokes.preview,
      };

  return (
    <g data-group="overlays">
      <Layer name="unseen" d={layers.unseen} fill={TRACK_COLORS.unseenWall} />
      <Layer
        name="diff-added"
        d={layers.diff.added}
        fill={TRACK_COLORS.diff}
        fillOpacity={TRACK_OPACITY.diffFill}
        {...diff}
      />
      <Layer name="diff-marked" d={layers.diff.marked} {...diff} />
      <Layer
        name="diff-dashed"
        d={layers.diff.dashed}
        strokeDasharray={strokes.diffDash}
        {...diff}
      />
      {playing ? shortest : null}
      {layers.exploration === undefined ? null : (
        <RouteGroup
          color={EXPLORATION_COLOR}
          name="exploration"
          route={layers.exploration}
          strokes={strokes}
        />
      )}
      {playing ? null : shortest}
      <Layer
        name="robot"
        d={layers.robot}
        fill={TRACK_COLORS.cursor}
        stroke={TRACK_COLORS.floor}
        strokeWidth={strokes.robot}
        {...ROUND}
      />
      <Layer
        name="focus-outline"
        d={layers.focusOutline}
        stroke={TRACK_COLORS.focus}
        strokeWidth={strokes.focus}
      />
      <Layer
        name="focus-area"
        d={layers.focusArea}
        fill={TRACK_COLORS.focus}
        fillOpacity={TRACK_OPACITY.focusFill}
        stroke={TRACK_COLORS.focus}
        strokeWidth={strokes.focus}
      />
      <Layer
        name="selection"
        d={layers.selection}
        fill={TRACK_COLORS.cursor}
        fillOpacity={TRACK_OPACITY.selectionFill}
        stroke={TRACK_COLORS.cursor}
        strokeWidth={strokes.selection}
        strokeDasharray={strokes.selectionDash}
      />
      <Layer name="preview" d={layers.preview} {...preview} />
      <Layer
        name="cursor"
        d={layers.cursor}
        stroke={TRACK_COLORS.cursor}
        strokeWidth={strokes.cursor}
      />
    </g>
  );
}

/**
 * A maze drawn like the real track, as one SVG with a path per layer (PLAN.md 3.3, DESIGN.md 2.2
 * and 2.3), and the editor's overlays on top. It is as large as its geometry in CSS pixels, world
 * units for a camera to scale. It is decorative, since the canvas around it carries the label,
 * unless it is given a label of its own, as the embed gives it.
 */
export function Board({
  maze,
  overlays = NO_OVERLAYS,
  size = ARTBOARD_SIZE,
  label,
  className,
  style,
}: BoardProps) {
  const geometry = useMemo(() => boardGeometry(maze, { size }), [maze, size]);
  const width = formatLength(geometry.width);
  const height = formatLength(geometry.height);

  return (
    <svg
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      className={cn('block shadow-slab', className)}
      data-board=""
      height={height}
      role={label === undefined ? undefined : 'img'}
      style={style}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      <Track geometry={geometry} maze={maze} />
      <Overlays geometry={geometry} overlays={overlays} />
    </svg>
  );
}
