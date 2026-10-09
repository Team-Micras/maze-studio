import { CornersOut, Minus, Plus } from '@phosphor-icons/react';
import { memo } from 'react';

import { KEY_ZOOM_FACTOR } from '@/render';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import { cn } from '@/ui/primitives/utils';

import { Hint, Island, IslandButton } from './island';

/** The props of {@link ZoomIsland}. */
export interface ZoomIslandProps extends Pick<CanvasCamera, 'zoomBy' | 'refit'> {
  /** The zoom as a percentage of the fit. */
  readonly percent: number;
  /** Across, as on a notebook, or down the right edge, as on a phone (DESIGN.md 9.3). */
  readonly orientation?: 'horizontal' | 'vertical';
  readonly className?: string;
}

/** The zoom-out button, apart so the moving percentage never re-renders it. */
const ZoomOutButton = memo(function ZoomOutButton({ zoomBy }: Pick<ZoomIslandProps, 'zoomBy'>) {
  return (
    <Hint label="Zoom out" shortcut="-">
      <IslandButton aria-label="Zoom out" onClick={() => zoomBy(1 / KEY_ZOOM_FACTOR)}>
        <Minus aria-hidden size={18} />
      </IslandButton>
    </Hint>
  );
});

/** The zoom-in button, apart so the moving percentage never re-renders it. */
const ZoomInButton = memo(function ZoomInButton({ zoomBy }: Pick<ZoomIslandProps, 'zoomBy'>) {
  return (
    <Hint label="Zoom in" shortcut="+">
      <IslandButton aria-label="Zoom in" onClick={() => zoomBy(KEY_ZOOM_FACTOR)}>
        <Plus aria-hidden size={18} />
      </IslandButton>
    </Hint>
  );
});

/** The fit button, apart so the moving percentage never re-renders it. */
const FitButton = memo(function FitButton({ refit }: Pick<ZoomIslandProps, 'refit'>) {
  return (
    <Hint label="Fit" shortcut="0">
      <IslandButton aria-label="Fit" onClick={() => refit({ animate: true })}>
        <CornersOut aria-hidden size={18} />
      </IslandButton>
    </Hint>
  );
});

/**
 * Zoom out, the zoom as a percentage of the fit, zoom in and fit (DESIGN.md 9). The percentage is
 * plain text, read on demand, not a live region that would speak at every frame of a zoom; it is
 * the only part a moving camera re-renders.
 */
export function ZoomIsland({
  zoomBy,
  refit,
  percent,
  orientation = 'horizontal',
  className,
}: ZoomIslandProps) {
  return (
    <Island className={cn('fixed', orientation === 'vertical' && 'flex-col', className)}>
      <ZoomOutButton zoomBy={zoomBy} />
      <span
        className="min-w-12 text-center font-mono text-xs text-muted-foreground tabular-nums"
        data-zoom=""
      >
        <span className="sr-only">Zoom </span>
        {percent}%
      </span>
      <ZoomInButton zoomBy={zoomBy} />
      <FitButton refit={refit} />
    </Island>
  );
}
