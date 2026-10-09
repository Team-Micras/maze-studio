/** Whether `target` takes text, where single-letter shortcuts never fire (DESIGN.md 11). */
export function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
