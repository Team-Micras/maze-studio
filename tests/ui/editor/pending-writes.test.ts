import { describe, expect, test } from 'vitest';

import { trackWriter, writesSettled } from '@/ui/editor/pending-writes';

function slowWriter(): { writer: { idle: () => Promise<void> }; finish: () => void } {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { writer: { idle: () => promise }, finish: () => resolve() };
}

describe('writesSettled', () => {
  test('waits for every writer tracked, and no longer for one untracked', async () => {
    const first = slowWriter();
    const second = slowWriter();
    const stopFirst = trackWriter(first.writer);
    const stopSecond = trackWriter(second.writer);
    let settled = false;
    void writesSettled().then(() => {
      settled = true;
    });

    first.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    second.finish();
    await expect.poll(() => settled).toBe(true);

    stopFirst();
    stopSecond();
    const stuck = slowWriter();
    const stopStuck = trackWriter(stuck.writer);
    stopStuck();
    await expect(writesSettled()).resolves.toBeUndefined();
  });
});
