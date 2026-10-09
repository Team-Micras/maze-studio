/** The system the page runs on: the client hints' platform where the browser has them. */
function platformName(): string {
  if (typeof navigator === 'undefined') {
    return '';
  }

  const hints: unknown = Reflect.get(navigator, 'userAgentData');
  const hinted: unknown =
    typeof hints === 'object' && hints !== null && 'platform' in hints ? hints.platform : undefined;
  return typeof hinted === 'string' && hinted !== '' ? hinted : navigator.platform;
}

/** Whether the page runs on a Mac, an iPhone or an iPad, where shortcuts read ⌘ for Ctrl. */
export function applePlatform(): boolean {
  return /mac|iphone|ipad|ios/i.test(platformName());
}

/** A shortcut as the platform names it: `Ctrl` becomes `⌘` on Apple's systems. */
export function shortcutLabel(keys: string): string {
  return applePlatform() ? keys.replace(/\bCtrl\b/g, '⌘') : keys;
}
