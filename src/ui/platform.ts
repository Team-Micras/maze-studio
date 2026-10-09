/** Whether the page runs on a Mac, an iPhone or an iPad, where shortcuts read ⌘ for Ctrl. */
export function applePlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

/** A shortcut as the platform names it: `Ctrl` becomes `⌘` on Apple's systems. */
export function shortcutLabel(keys: string): string {
  return applePlatform() ? keys.replace(/\bCtrl\b/g, '⌘') : keys;
}
