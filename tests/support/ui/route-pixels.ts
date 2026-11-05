/**
 * Whether a thumbnail shows the amber of the route with diagonals, for tests of the routes drawn on
 * thumbnails.
 *
 * @module
 */

/** Whether any pixel of `canvas` is the amber of the route with diagonals. */
export function showsAmberRoute(canvas: HTMLCanvasElement | null | undefined): boolean {
  const data = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;

  for (let index = 0; index < (data?.length ?? 0); index += 4) {
    if (
      (data?.[index] ?? 0) > 200 &&
      (data?.[index + 1] ?? 0) > 150 &&
      (data?.[index + 2] ?? 255) < 120
    ) {
      return true;
    }
  }

  return false;
}
