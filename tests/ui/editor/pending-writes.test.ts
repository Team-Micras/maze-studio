import { afterEach, describe, expect, test, vi } from 'vitest';

import { noteWrites, SLOW_WRITE, SLOW_WRITE_MS } from '@/ui/editor/pending-writes';
import * as toasts from '@/ui/toasts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Writes on their way', () => {
  test('say once that saving is taking long, however many are waiting, and not when they end in time', async () => {
    vi.useFakeTimers();
    const shown = vi.spyOn(toasts, 'showToast').mockImplementation(() => undefined);
    noteWrites(Promise.resolve());
    await vi.advanceTimersByTimeAsync(SLOW_WRITE_MS);

    expect(shown).not.toHaveBeenCalled();

    const stuck = new Promise<void>(() => undefined);
    noteWrites(stuck);
    noteWrites(stuck);
    noteWrites(stuck);
    await vi.advanceTimersByTimeAsync(SLOW_WRITE_MS * 2);

    expect(shown.mock.calls).toEqual([[SLOW_WRITE]]);
  });
});
