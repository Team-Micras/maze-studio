/**
 * Where the focus goes when an overlay closes. Radix puts it back on the trigger, which is right
 * after a key closed it, but Chromium then draws the focus ring on a trigger a click or a tap
 * closed it from; so after a pointer the focus stays where it falls.
 *
 * @module
 */

let byPointer = false;
let listening = false;

function listen(): void {
  if (!listening) {
    listening = true;
    window.addEventListener('pointerdown', () => (byPointer = true), true);
    window.addEventListener('keydown', () => (byPointer = false), true);
  }
}

/**
 * An `onCloseAutoFocus` that runs `handler`, then keeps the focus off the trigger when the last
 * input was a pointer.
 */
export function closeAutoFocus(handler?: (event: Event) => void): (event: Event) => void {
  listen();
  return (event) => {
    handler?.(event);

    if (byPointer) {
      event.preventDefault();
    }
  };
}
