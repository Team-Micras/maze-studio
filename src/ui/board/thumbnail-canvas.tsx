import { useEffect, useRef } from 'react';

import { encodeMazeCode, type Maze, type MazeDiff } from '@/maze';
import {
  boardGeometry,
  paintTrack,
  PREVIEW_BAND,
  thumbnailBand,
  type ThumbnailBand,
} from '@/render';
import { cn } from '@/ui/primitives/utils';

import { schedulePaint } from './paint-queue';
import { thumbnailCache } from './thumbnail-cache';
import { useDevicePixelRatio } from './use-device-pixel-ratio';

/** The props of {@link ThumbnailCanvas}. */
export interface ThumbnailCanvasProps {
  readonly maze: Maze;
  /** The width on screen, in CSS pixels. */
  readonly width: number;
  /** The height on screen, in CSS pixels. */
  readonly height: number;
  /**
   * The device pixels the thumbnail needs on its longest side, as when a camera scales it; its
   * CSS size times the device pixel ratio by default.
   */
  readonly resolution?: number;
  /**
   * Whether to take the bitmap from {@link thumbnailCache}; on by default. Turn it off for a maze
   * being edited, whose every edit would otherwise leave a bitmap behind in the cache.
   */
  readonly cached?: boolean;
  /**
   * A diff to draw on top, and what identifies the maze it is taken from (DESIGN.md 2.3): the
   * Changes panel's thumbnails.
   */
  readonly diff?: ThumbnailDiff;
  /**
   * Whether a missing bitmap first shows its preview, in {@link PREVIEW_BAND}, painted at the next
   * frame when no idle time comes first, and the sharp one in idle time, as through a fling of the
   * library's grid, which leaves almost no idle time on a phone; off by default.
   */
  readonly eachFrame?: boolean;
  readonly className?: string;
}

/** A diff drawn on a thumbnail, and the key of the maze it is taken from. */
export interface ThumbnailDiff {
  readonly diff: MazeDiff;
  readonly key: string;
}

function showBitmap(canvas: HTMLCanvasElement, bitmap: OffscreenCanvas): void {
  canvas.dataset.painted = '';
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
}

/**
 * Shows the cached thumbnail of `maze` in `band`: at once when the canvas shows nothing yet and
 * the bitmap is ready, in idle time otherwise, so switching every artboard to a new band never
 * lands in one frame. With `eachFrame`, a blank canvas shows the preview first: at once when it is
 * ready, at the next frame otherwise.
 */
function paintCached(
  canvas: HTMLCanvasElement,
  maze: Maze,
  band: ThumbnailBand,
  blank: boolean,
  diff: ThumbnailDiff | undefined,
  eachFrame: boolean
): () => void {
  const key = encodeMazeCode(maze);

  if (diff !== undefined) {
    return schedulePaint(() =>
      showBitmap(canvas, thumbnailCache.diffThumbnail(key, diff.key, maze, band, diff.diff))
    );
  }

  const ready = thumbnailCache.cached(key, band);

  if (ready !== undefined && blank) {
    showBitmap(canvas, ready);
    return () => undefined;
  }

  const sharp = (): void => showBitmap(canvas, thumbnailCache.thumbnail(key, maze, band));

  if (!eachFrame || !blank || band <= PREVIEW_BAND) {
    return schedulePaint(sharp, eachFrame);
  }

  const preview = thumbnailCache.cached(key, PREVIEW_BAND);

  if (preview !== undefined) {
    showBitmap(canvas, preview);
    return schedulePaint(sharp);
  }

  let cancel = schedulePaint(() => {
    showBitmap(canvas, thumbnailCache.thumbnail(key, maze, PREVIEW_BAND));
    cancel = schedulePaint(sharp);
  }, true);
  return () => cancel();
}

function paintLive(
  canvas: HTMLCanvasElement,
  maze: Maze,
  pixels: { width: number; height: number }
) {
  canvas.width = Math.max(1, Math.round(pixels.width));
  canvas.height = Math.max(1, Math.round(pixels.height));
  const context = canvas.getContext('2d');

  if (context === null) {
    return;
  }

  const geometry = boardGeometry(maze, {
    scale: 'thumbnail',
    size: Math.max(canvas.width, canvas.height),
  });
  context.scale(canvas.width / geometry.width, canvas.height / geometry.height);
  paintTrack(context, maze, geometry);
}

/**
 * A maze's thumbnail on a canvas. Cached, the bitmap comes from {@link thumbnailCache} in the
 * band that covers the resolution, so a camera zooming over it repaints only when the band
 * changes. The first bitmap of a canvas shows at once when it is already drawn; any other is
 * shown in idle time, the previous one staying until then; with `eachFrame` the preview comes
 * first. Live, it is painted straight on a canvas of the exact size. It paints again when the
 * device pixel ratio changes. Decorative: what it shows is named next to it.
 */
export function ThumbnailCanvas({
  maze,
  width,
  height,
  resolution,
  cached = true,
  diff,
  eachFrame = false,
  className,
}: ThumbnailCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ratio = useDevicePixelRatio();
  const band = thumbnailBand(resolution ?? Math.max(width, height) * ratio);

  useEffect(() => {
    const element = canvas.current;

    if (element === null) {
      return undefined;
    }

    if (cached) {
      return paintCached(
        element,
        maze,
        band,
        element.dataset.painted === undefined,
        diff,
        eachFrame
      );
    }

    paintLive(element, maze, { width: width * ratio, height: height * ratio });
    return undefined;
  }, [maze, width, height, ratio, cached, band, diff, eachFrame]);

  return (
    <canvas aria-hidden className={cn('block', className)} ref={canvas} style={{ width, height }} />
  );
}
