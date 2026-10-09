import { useCallback, useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';

import type { CatalogEntry } from '@/library';
import {
  mountedRows,
  revealCamera,
  rowOf,
  thumbnailBand,
  type Insets,
  type LibraryGrid,
} from '@/render';
import { CameraStage, type PrimaryPan } from '@/ui/board/camera-stage';
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
  /** Whether the artboards other than the active one fade out, as while a maze is open. */
  readonly othersHidden?: boolean;
  /**
   * The zoom the thumbnails are drawn for, when not the camera's: the library's own zoom while a
   * maze is open, so hidden artboards do not repaint for the editor's zoom.
   */
  readonly bandScale?: number;
  /** The artboard a maze was opened from or lands on: always mounted. */
  readonly activeKey?: string;
  /** Whether the active artboard hides too, as under an open board that covers it. */
  readonly activeHidden?: boolean;
  /** What the canvas is called for a screen reader. */
  readonly label?: string;
  /** What the primary button and one finger do on the canvas. */
  readonly primaryPan?: PrimaryPan;
  /** Hands on the kind of pointer that pressed an artboard: mouse, pen or touch. */
  readonly onArtboardPointer?: (pointerType: string) => void;
  /** More world content, drawn above the artboards, such as the open board. */
  readonly children?: ReactNode;
  readonly className?: string;
}

function artboardSide(grid: LibraryGrid): number {
  return Math.max(0, ...grid.places.map((place) => Math.max(place.width, place.height)));
}

/**
 * The library as a canvas of artboards (PLAN.md 3.4, DESIGN.md 7). Only the rows on screen and
 * one more above and below are mounted, and neither the artboard with the keyboard's focus nor
 * the active one ever leaves; Tab onto an artboard outside the insets brings the camera to it,
 * without animation. While a maze is open the other artboards fade out, keeping the thumbnail
 * band they had in the library.
 */
export function LibraryCanvas({
  library,
  entries,
  grid,
  insets,
  controller,
  othersHidden = false,
  bandScale,
  activeKey,
  activeHidden = false,
  label = 'Maze library',
  primaryPan = 'lazy',
  onArtboardPointer,
  children,
  className,
}: LibraryCanvasProps) {
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const ratio = useDevicePixelRatio();
  const { camera, limits } = controller;
  const { first, last } =
    camera === undefined || limits === undefined
      ? { first: 0, last: -1 }
      : mountedRows(camera, limits.viewport, grid);
  const band = thumbnailBand(artboardSide(grid) * (bandScale ?? camera?.k ?? 0) * ratio);

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

    if ((row < first || row > last) && entry.key !== focused && entry.key !== activeKey) {
      return [];
    }

    const maze = library.mazeOf(entry.key);
    return place !== undefined && maze !== undefined ? [{ entry, place, maze }] : [];
  });

  return (
    <CameraStage
      className={className}
      controller={controller}
      id={CANVAS_ID}
      label={label}
      primaryPan={primaryPan}
    >
      <div
        onPointerDownCapture={(event) => onArtboardPointer?.(event.pointerType)}
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
            hidden={entry.key === activeKey ? activeHidden : othersHidden}
            key={entry.key}
            maze={maze}
            onFocus={reveal}
            place={place}
          />
        ))}
      </div>
      {children}
    </CameraStage>
  );
}
