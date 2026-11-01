/** The id of the screen's canvas, which the skip link points at. */
export const CANVAS_ID = 'canvas';

/** Whether `target` is inside the screen's canvas, where a press keeps a panel open. */
export function insideCanvas(target: EventTarget | null): boolean {
  return target instanceof Node && document.getElementById(CANVAS_ID)?.contains(target) === true;
}
