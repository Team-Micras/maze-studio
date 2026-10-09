import { useEffect, useRef } from 'react';

import { encodeMazeCode, type Maze } from '@/maze';
import { boardGeometry, paintTrack } from '@/render';
import { cn } from '@/ui/primitives/utils';

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
   * Whether to take the bitmap from {@link thumbnailCache}; on by default. Turn it off for a maze
   * being edited, whose every edit would otherwise leave a bitmap behind in the cache.
   */
  readonly cached?: boolean;
  readonly className?: string;
}

function paint(canvas: HTMLCanvasElement, maze: Maze, cached: boolean): void {
  const context = canvas.getContext('2d');

  if (context === null) {
    return;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  const pixels = Math.max(canvas.width, canvas.height);

  if (cached) {
    const bitmap = thumbnailCache.thumbnail(encodeMazeCode(maze), maze, pixels);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return;
  }

  const geometry = boardGeometry(maze, { scale: 'thumbnail', size: pixels });
  context.scale(canvas.width / geometry.width, canvas.height / geometry.height);
  paintTrack(context, maze, geometry);
}

/**
 * A maze's thumbnail on a canvas sized in device pixels, taken from {@link thumbnailCache} in
 * the band that covers it, or painted straight on the canvas when not cached. It paints again
 * when the device pixel ratio changes. Decorative: what it shows is named next to it.
 */
export function ThumbnailCanvas({
  maze,
  width,
  height,
  cached = true,
  className,
}: ThumbnailCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ratio = useDevicePixelRatio();

  useEffect(() => {
    const element = canvas.current;

    if (element === null) {
      return;
    }

    element.width = Math.max(1, Math.round(width * ratio));
    element.height = Math.max(1, Math.round(height * ratio));
    paint(element, maze, cached);
  }, [maze, width, height, ratio, cached]);

  return (
    <canvas aria-hidden className={cn('block', className)} ref={canvas} style={{ width, height }} />
  );
}
