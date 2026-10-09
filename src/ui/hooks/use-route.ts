import { useSyncExternalStore } from 'react';

import { ROUTE_CHANGED } from '@/ui/navigation';
import { parseRoute, type Route } from '@/ui/routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  window.addEventListener(ROUTE_CHANGED, onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener(ROUTE_CHANGED, onChange);
  };
}

function currentHash(): string {
  return window.location.hash;
}

/** The route in the URL's hash, updated as it changes. */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, currentHash));
}
