/**
 * The camera a mounted camera stage shows, read back from the DOM.
 *
 * @module
 */

import type { Camera } from '@/render';

/** The camera the stage shows, read from the world layer's transform. */
export function shownCamera(): Camera {
  const world = document.querySelector<HTMLElement>('[data-world]');
  const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(
    world?.style.transform ?? ''
  );

  if (match === null) {
    throw new Error('the world has no camera yet');
  }

  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) };
}
