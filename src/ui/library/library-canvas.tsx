import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';

import type { CatalogEntry } from '@/library';
import {
  mountedRows,
  revealCamera,
  rowOf,
  thumbnailBand,
  type Insets,
  type LibraryGrid,
} from '@/render';
import { CameraStage } from '@/ui/board/camera-stage';
import { CANVAS_ID } from '@/ui/canvas-id';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import { useDevicePixelRatio } from '@/ui/board/use-device-pixel-ratio';

import { Artboard } from './artboard';
import type { Library } from './use-library';

/** The props of {@link LibraryCanvas}. */
export interface LibraryCanvasProps {
  readonly library: Library;
  /** The entries shown, in grid order. */
  readonly entries: readonly CatalogEntry[];
  readonly grid: LibraryGrid;
  readonly insets: Insets;
  readonly controller: CanvasCamera;
  readonly className?: string;
}

function artboardSide(grid: LibraryGrid): number {
  return Math.max(0, ...grid.places.map((place) => Math.max(place.width, place.height)));
}

/**
 * The library as a canvas of artboards (PLAN.md 3.4, DESIGN.md 7). Only the rows on screen and
 * one more above and below are mounted, and the artboard with the keyboard's focus never leaves;
 * Tab onto an artboard outside the insets brings the camera to it, without animation.
 */
export function LibraryCanvas({
  library,
  entries,
  grid,
  insets,
  controller,
  className,
}: LibraryCanvasProps) {
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const ratio = useDevicePixelRatio();
  const { camera, limits } = controller;
  const { first, last } =
    camera === undefined || limits === undefined
      ? { first: 0, last: -1 }
      : mountedRows(camera, limits.viewport, grid);
  const band = thumbnailBand(artboardSide(grid) * (camera?.k ?? 0) * ratio);

  const latest = useRef({ camera, limits, entries, grid, insets, set: controller.set });

  useEffect(() => {
    latest.current = { camera, limits, entries, grid, insets, set: controller.set };
  });

  const reveal = useCallback((key: string, event: FocusEvent<HTMLAnchorElement>): void => {
    setFocused(key);
    const now = latest.current;
    const place = now.grid.places[now.entries.findIndex((entry) => entry.key === key)];

    if (
      place !== undefined &&
      now.camera !== undefined &&
      now.limits !== undefined &&
      event.target.matches(':focus-visible')
    ) {
      now.set(revealCamera(now.camera, place, now.limits.viewport, now.insets));
    }
  }, []);

  const mounted = entries.flatMap((entry, index) => {
    const row = rowOf(index, grid);
    const place = grid.places[index];

    if ((row < first || row > last) && entry.key !== focused) {
      return [];
    }

    const maze = library.mazeOf(entry.key);
    return place !== undefined && maze !== undefined ? [{ entry, place, maze }] : [];
  });

  return (
    <CameraStage className={className} controller={controller} id={CANVAS_ID} label="Maze library">
      <div
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocused(undefined);
          }
        }}
      >
        {mounted.map(({ entry, place, maze }) => (
          <Artboard
            band={band}
            entry={entry}
            key={entry.key}
            maze={maze}
            onFocus={reveal}
            place={place}
          />
        ))}
      </div>
    </CameraStage>
  );
}
