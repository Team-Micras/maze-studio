import { useSyncExternalStore } from 'react';

function currentRatio(): number {
  return window.devicePixelRatio || 1;
}

function subscribe(onChange: () => void): () => void {
  let query: MediaQueryList | undefined;

  const listen = (): void => {
    query?.removeEventListener('change', handleChange);
    query = window.matchMedia(`(resolution: ${currentRatio()}dppx)`);
    query.addEventListener('change', handleChange);
  };

  function handleChange(): void {
    listen();
    onChange();
  }

  listen();
  return () => query?.removeEventListener('change', handleChange);
}

/**
 * The device pixel ratio, updated when it changes, as when the browser zooms or the window moves
 * to a screen of another density. A media query matches one ratio only, so each change listens
 * again with a query for the new one.
 */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, currentRatio);
}
