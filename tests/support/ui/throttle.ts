/**
 * CPU throttling through the DevTools protocol, for the library's frame budget, which DESIGN.md 8
 * measures at four times slower than the machine.
 *
 * @module
 */

import type { CDPSession } from '@vitest/browser-playwright';
import { cdp } from 'vitest/browser';

/** Runs `measure` with the CPU slowed `rate` times, and restores full speed afterwards. */
export async function throttled<T>(rate: number, measure: () => Promise<T>): Promise<T> {
  const session: CDPSession = cdp();
  await session.send('Emulation.setCPUThrottlingRate', { rate });

  try {
    return await measure();
  } finally {
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
}
