/**
 * The skeleton a thumbnail shows until its bitmap is painted: the still grey maze the generator's
 * cards show while waiting their turn (`LoadingCanvas`), drawn once per size into an image the
 * artboards take as their CSS background, so a fling pays nothing for it.
 *
 * @module
 */

import { boardGeometry } from '@/render';
import { paintLoading, waitingLines, waveScene } from '@/render/loading';

import { schedulePaint } from './paint-queue';

/** The side of the skeleton's image, in device pixels: a phone's card at three times. */
const SKELETON_PIXELS = 512;

let scheduled = false;

function paintSkeleton(size: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = SKELETON_PIXELS;
  canvas.height = SKELETON_PIXELS;
  const context = canvas.getContext('2d');

  if (context === null) {
    return;
  }

  paintLoading(
    context,
    boardGeometry({ width: size, height: size }, { scale: 'thumbnail', size: SKELETON_PIXELS }),
    waveScene(waitingLines(size), size, 0, true)
  );
  canvas.toBlob((blob) => {
    if (blob !== null) {
      document.documentElement.style.setProperty(
        `--thumbnail-skeleton-${size}`,
        `url(${URL.createObjectURL(blob)})`
      );
    }
  });
}

/**
 * Sets `--thumbnail-skeleton-16` and `--thumbnail-skeleton-32` on the document to the skeletons
 * of 16 × 16 and 32 × 32, each painted once in idle time; until then an artboard shows its floor
 * colour.
 */
export function paintThumbnailSkeletons(): void {
  if (scheduled) {
    return;
  }

  scheduled = true;
  schedulePaint(() => paintSkeleton(16));
  schedulePaint(() => paintSkeleton(32));
}
