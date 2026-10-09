import { zoomOf } from '@/render';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';

/** The camera's zoom as a whole percentage of the fit; 100 before the camera is measured. */
export function zoomPercent({ camera, limits }: Pick<CanvasCamera, 'camera' | 'limits'>): number {
  return camera === undefined || limits === undefined
    ? 100
    : Math.round(zoomOf(camera, limits) * 100);
}
