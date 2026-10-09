import { useSyncExternalStore } from 'react';

function currentRatio(): number {
  return window.devicePixelRatio || 1;
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(`(resolution: ${currentRatio()}dppx)`);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * The device pixel ratio, updated when it changes, as when the browser zooms or the window moves
 * to a screen of another density.
 */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, currentRatio);
}
