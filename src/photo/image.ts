/**
 * Photos as the browser decodes them, and the grey planes the recogniser works on.
 *
 * @module
 */

/** An RGBA photo, four bytes a pixel row by row, as in `ImageData`. */
export interface Photo {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/** A grey image of values from 0 to 1, one a pixel row by row, `NaN` where nothing was seen. */
export interface Plane {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/**
 * How light each pixel is, as the largest of its red, green and blue: white and coloured wall
 * tops both read high, the black floor low.
 */
export function lightness(photo: Photo): Plane {
  const data = new Float32Array(photo.width * photo.height);

  for (let index = 0; index < data.length; index++) {
    const offset = index * 4;
    data[index] =
      Math.max(photo.data[offset], photo.data[offset + 1], photo.data[offset + 2]) / 255;
  }

  return { width: photo.width, height: photo.height, data };
}

/**
 * The value of `plane` at `(x, y)`, pixel centres being at whole coordinates, interpolated
 * bilinearly; `NaN` outside the plane.
 */
export function sampleBilinear(plane: Plane, x: number, y: number): number {
  if (!(x >= 0 && y >= 0 && x <= plane.width - 1 && y <= plane.height - 1)) {
    return Number.NaN;
  }

  const x0 = Math.min(Math.floor(x), plane.width - 2);
  const y0 = Math.min(Math.floor(y), plane.height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const index = y0 * plane.width + x0;
  const top = plane.data[index] * (1 - fx) + plane.data[index + 1] * fx;
  const bottom =
    plane.data[index + plane.width] * (1 - fx) + plane.data[index + plane.width + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}
