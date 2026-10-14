import { useEffect } from 'react';

import { applyTheme, forcedTheme, type Theme } from '@/ui/theme';

import { READY_MESSAGE, themeOfMessage } from './theme-message';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * The embed's theme: the one `?theme=` forces, or else the system's, followed as it changes; a
 * theme message from the page that frames it wins over both from then on. A message from anywhere
 * but the parent window, or of any other shape, is ignored. Once it listens, it tells the parent
 * with {@link READY_MESSAGE}, so a page that posts the theme then cannot post it too early.
 */
export function useEmbedTheme(): void {
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    let chosen: Theme | undefined = forcedTheme(window.location.search);
    const show = (): void => applyTheme(chosen ?? (media.matches ? 'dark' : 'light'));
    const onMessage = (event: MessageEvent): void => {
      const theme = event.source === window.parent ? themeOfMessage(event.data) : undefined;

      if (theme !== undefined) {
        chosen = theme;
        show();
      }
    };

    show();
    media.addEventListener('change', show);
    window.addEventListener('message', onMessage);

    if (window.parent !== window) {
      window.parent.postMessage({ type: READY_MESSAGE }, '*');
    }

    return () => {
      media.removeEventListener('change', show);
      window.removeEventListener('message', onMessage);
    };
  }, []);
}
