import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/** The viewport's width in CSS pixels, updated as it resizes. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, () => window.innerWidth);
}
