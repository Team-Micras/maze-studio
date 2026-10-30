import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { boardGeometry, type TrackScale } from '@/render';
import {
  boardScene,
  paintLoading,
  SETTLE,
  waitingLines,
  waveScene,
  type LoadingTrack,
} from '@/render/loading';
import { useDevicePixelRatio } from '@/ui/board/use-device-pixel-ratio';
import { useMediaQuery } from '@/ui/hooks/use-media-query';
import { cn } from '@/ui/primitives/utils';

/** The props of {@link LoadingCanvas}. */
export interface LoadingCanvasProps {
  /** The wall thickness it draws with: a card's thumbnail or the board's. */
  readonly scale: TrackScale;
  /** The side of the board, in cells. */
  readonly size: 16 | 32;
  /** What the maze has shown of its progress, read every frame; a card shows the wave only. */
  readonly track?: () => LoadingTrack;
  /** When the maze was built: from then it fades out over the maze drawn under it, then goes. */
  readonly builtAt?: number;
  /** How far ahead the wave's clock runs, in milliseconds, so cards do not sweep in step. */
  readonly offset?: number;
  /** Screen pixels per CSS pixel of its box, as when a camera scales it; 1 by default. */
  readonly zoom?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** The longest side of its bitmap, in device pixels, however far a camera zooms in. */
const MAX_PIXELS = 4096;

/**
 * A maze still being generated, in grey on a canvas of its own (the mockup's `flow.html`): the
 * wave over a decorative maze, or with `track` the board's view of the progress. Once `builtAt`
 * is set it fades out in {@link SETTLE} ms over the maze drawn under it and unmounts. Without
 * motion the wave stands still until a snapshot reads as a maze, the first such stays, and the
 * built maze shows at once.
 * Decorative: what it shows is named next to it.
 */
export function LoadingCanvas({
  scale,
  size,
  track,
  builtAt,
  offset = 0,
  zoom = 1,
  className,
  style,
}: LoadingCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ratio = useDevicePixelRatio();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [gone, setGone] = useState(false);

  const redraw = useRef<() => void>(() => undefined);
  const latest = useRef(track);

  useLayoutEffect(() => {
    latest.current = track;
  });

  useLayoutEffect(() => {
    const element = canvas.current;

    if (element === null) {
      return undefined;
    }

    const fit = (): void => {
      const pixels = Math.min(
        MAX_PIXELS,
        Math.max(1, Math.round(element.clientWidth * ratio * zoom))
      );

      if (element.width !== pixels) {
        element.width = pixels;
        element.height = pixels;
        redraw.current();
      }
    };

    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [zoom, ratio]);

  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');

    if (element === null || context === null || context === undefined) {
      return undefined;
    }

    const waiting = waitingLines(size);
    let frame = 0;
    let shown: LoadingTrack | undefined;
    let first: LoadingTrack | undefined;
    let painted = false;

    const paint = (): void => {
      const now = performance.now();

      if (builtAt !== undefined) {
        const left = 1 - (now - builtAt) / SETTLE;

        if (reduced || left <= 0) {
          setGone(true);
          return;
        }

        element.style.opacity = String(left);
      }

      const read = latest.current?.();

      if (reduced && first === undefined && (read?.walls ?? null) !== null) {
        first = read;
      }

      const current = reduced ? first : read;
      const still = reduced || (current?.walls ?? null) !== null;

      if (!still || current !== shown || !painted) {
        const geometry = boardGeometry(
          { width: size, height: size },
          { scale, size: element.width }
        );
        paintLoading(
          context,
          geometry,
          current === undefined
            ? waveScene(waiting, size, now + offset, reduced)
            : boardScene(current, waiting, size, now, reduced)
        );
        shown = current;
        painted = true;
      }

      if (!reduced || (latest.current !== undefined && first === undefined)) {
        frame = requestAnimationFrame(paint);
      }
    };

    redraw.current = () => {
      cancelAnimationFrame(frame);
      painted = false;
      paint();
    };
    paint();

    return () => {
      cancelAnimationFrame(frame);
      redraw.current = () => undefined;
    };
  }, [scale, size, builtAt, offset, reduced]);

  if (gone) {
    return null;
  }

  return (
    <canvas
      aria-hidden
      className={cn('block aspect-square', className)}
      data-loading=""
      ref={canvas}
      style={style}
    />
  );
}
