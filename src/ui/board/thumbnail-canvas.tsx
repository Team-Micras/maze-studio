import { useEffect, useRef } from 'react';

import { encodeMazeCode, type Maze } from '@/maze';
import { cn } from '@/ui/primitives/utils';

import { thumbnailCache } from './thumbnail-cache';

/** The props of {@link ThumbnailCanvas}. */
export interface ThumbnailCanvasProps {
  readonly maze: Maze;
  /** The width on screen, in CSS pixels. */
  readonly width: number;
  /** The height on screen, in CSS pixels. */
  readonly height: number;
  readonly className?: string;
}

/**
 * A maze's thumbnail on a canvas, taken from {@link thumbnailCache} in the band that covers its
 * size in device pixels. Decorative: what it shows is named next to it.
 */
export function ThumbnailCanvas({ maze, width, height, className }: ThumbnailCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = encodeMazeCode(maze);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');

    if (element === null || context === null || context === undefined) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    element.width = Math.max(1, Math.round(width * ratio));
    element.height = Math.max(1, Math.round(height * ratio));
    const bitmap = thumbnailCache.thumbnail(key, maze, Math.max(element.width, element.height));
    context.clearRect(0, 0, element.width, element.height);
    context.drawImage(bitmap, 0, 0, element.width, element.height);
  }, [key, maze, width, height]);

  return (
    <canvas aria-hidden className={cn('block', className)} ref={canvas} style={{ width, height }} />
  );
}
