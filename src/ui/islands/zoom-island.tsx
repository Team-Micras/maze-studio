import { CornersOut, Minus, Plus } from '@phosphor-icons/react';

import { KEY_ZOOM_FACTOR } from '@/render';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import { cn } from '@/ui/primitives/utils';

import { Hint, Island, IslandButton } from './island';

/** The props of {@link ZoomIsland}. */
export interface ZoomIslandProps extends Pick<CanvasCamera, 'zoomBy' | 'refit'> {
  /** The zoom as a percentage of the fit. */
  readonly percent: number;
  readonly className?: string;
}

/**
 * Zoom out, the zoom as a percentage of the fit, zoom in and fit (DESIGN.md 9). It takes the
 * camera's stable actions, not the camera, so a moving camera redraws only the percentage.
 */
export function ZoomIsland({ zoomBy, refit, percent, className }: ZoomIslandProps) {
  return (
    <Island className={cn('fixed', className)}>
      <Hint label="Zoom out" shortcut="-">
        <IslandButton aria-label="Zoom out" onClick={() => zoomBy(1 / KEY_ZOOM_FACTOR)}>
          <Minus aria-hidden size={18} />
        </IslandButton>
      </Hint>
      <output
        aria-label="Zoom"
        className="min-w-12 text-center font-mono text-xs text-muted-foreground tabular-nums"
      >
        {percent}%
      </output>
      <Hint label="Zoom in" shortcut="+">
        <IslandButton aria-label="Zoom in" onClick={() => zoomBy(KEY_ZOOM_FACTOR)}>
          <Plus aria-hidden size={18} />
        </IslandButton>
      </Hint>
      <Hint label="Fit" shortcut="0">
        <IslandButton aria-label="Fit" onClick={() => refit({ animate: true })}>
          <CornersOut aria-hidden size={18} />
        </IslandButton>
      </Hint>
    </Island>
  );
}
