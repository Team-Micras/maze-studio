import { useSyncExternalStore } from 'react';

import { isWriting, onWritingChange } from './pending-writes';

/** Whether writes to My mazes are on their way, as the maze list's save state shows. */
export function useWriting(): boolean {
  return useSyncExternalStore(onWritingChange, isWriting);
}
