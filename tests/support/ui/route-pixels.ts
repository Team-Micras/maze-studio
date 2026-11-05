/**
 * Whether a thumbnail shows the amber of the route with diagonals or the periwinkle of the
 * flood-fill search, for tests of what is drawn on thumbnails.
 *
 * @module
 */

type Pixel = (red: number, green: number, blue: number) => boolean;

function shows(canvas: HTMLCanvasElement | null | undefined, pixel: Pixel): boolean {
  const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;

  for (let index = 0; index < (data?.length ?? 0); index += 4) {
    if (pixel(data?.[index] ?? 0, data?.[index + 1] ?? 0, data?.[index + 2] ?? 0)) {
      return true;
    }
  }

  return false;
}

/** Whether any pixel of `canvas` is the amber of the route with diagonals. */
export function showsAmberRoute(canvas: HTMLCanvasElement | null | undefined): boolean {
  return shows(canvas, (red, green, blue) => red > 200 && green > 150 && blue < 120);
}

/** Whether any pixel of `canvas` is the periwinkle of the flood-fill search. */
export function showsExploration(canvas: HTMLCanvasElement | null | undefined): boolean {
  return shows(
    canvas,
    (red, green, blue) => red > 130 && red < 190 && green > 140 && green < 195 && blue > 215
  );
}
