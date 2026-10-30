import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';

import { useMineBackup } from '@/ui/library/use-mine-backup';
import { appStorage } from '@/ui/storage';
import { useToasts } from '@/ui/toasts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Export all', () => {
  test('says the export failed when My mazes cannot be read at all', async () => {
    const storage = await appStorage();

    if (storage === undefined) {
      throw new Error('the test browser has no IndexedDB');
    }

    vi.spyOn(storage.mine, 'read').mockRejectedValue(new Error('IndexedDB could not be read'));
    const hook = await renderHook(() => useMineBackup());

    await hook.result.current.exportAll();

    expect(useToasts.getState().toasts.map((toast) => toast.text)).toContain(
      'Could not export My mazes (IndexedDB could not be read)'
    );
  });
});
