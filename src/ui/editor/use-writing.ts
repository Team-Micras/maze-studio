import { useEffect, useState, useSyncExternalStore } from 'react';

import { isWriting, onWritingChange } from './pending-writes';

/** How long writes must last before the maze list says "Saving…", so quick ones never flash it. */
export const SAVING_SHOWN_AFTER_MS = 300;

/**
 * Whether writes to My mazes have been on their way for {@link SAVING_SHOWN_AFTER_MS} or more, as
 * the maze list's save state shows; back to `false` as soon as they are done.
 */
export function useWriting(): boolean {
  const writing = useSyncExternalStore(onWritingChange, isWriting);
  const [long, setLong] = useState(false);

  useEffect(() => {
    if (!writing) {
      return undefined;
    }

    const timer = window.setTimeout(() => setLong(true), SAVING_SHOWN_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setLong(false);
    };
  }, [writing]);

  return writing && long;
}
