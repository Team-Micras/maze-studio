/**
 * The messages between the embed and the page that frames it: the embed posts
 * `{ type: 'maze-studio:ready' }` once it listens, and the page posts
 * `{ type: 'maze-studio:theme', theme: 'light' | 'dark' }` to set its theme without reloading it.
 *
 * @module
 */

import type { Theme } from '@/ui/theme';

/** The `type` of the message the embed posts to its parent once it takes the theme message. */
export const READY_MESSAGE = 'maze-studio:ready';

/** The `type` of the theme message. */
export const THEME_MESSAGE = 'maze-studio:theme';

/**
 * The theme a message's data asks for, or `undefined` unless the data is the theme message: an
 * object whose `type` is {@link THEME_MESSAGE} and whose `theme` is one of the two themes. Other
 * keys are left alone, for messages of later versions.
 */
export function themeOfMessage(data: unknown): Theme | undefined {
  if (typeof data !== 'object' || data === null || !('type' in data) || !('theme' in data)) {
    return undefined;
  }

  return data.type === THEME_MESSAGE && (data.theme === 'light' || data.theme === 'dark')
    ? data.theme
    : undefined;
}
