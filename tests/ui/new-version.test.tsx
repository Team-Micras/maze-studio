import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import '@/ui/styles.css';
import { offerReload } from '@/ui/new-version';
import { Toaster } from '@/ui/toaster';
import { ACTION_TOAST_DURATION_MS, showToast, useToasts } from '@/ui/toasts';

afterEach(() => {
  useToasts.setState({ toasts: [] });
});

function nothing(): void {}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = nothing;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

function shown(text: string): number {
  return [...document.querySelectorAll('ol li')].filter((item) => item.textContent?.includes(text))
    .length;
}

describe('A new version', () => {
  test('stays as "New version. Reload" past the time of a toast with an action, and Reload runs the update', async () => {
    const reload = vi.fn<() => void>();
    await render(<Toaster />);
    offerReload(reload);
    showToast('Exported 1, skipped 1', {
      action: { label: 'Details', altText: 'Show the skipped mazes', run: () => undefined },
    });
    await expect.poll(() => shown('New version.')).toBe(1);
    await expect.poll(() => shown('Exported 1, skipped 1')).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, ACTION_TOAST_DURATION_MS + 600));
    expect(shown('Exported 1, skipped 1')).toBe(0);
    expect(shown('New version.')).toBe(1);

    await userEvent.click(page.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  test('goes when closed, without reloading', async () => {
    const reload = vi.fn<() => void>();
    await render(<Toaster />);
    offerReload(reload);
    await expect.poll(() => shown('New version.')).toBe(1);

    await userEvent.click(page.getByRole('button', { name: 'Close' }));
    await expect.poll(() => shown('New version.')).toBe(0);
    expect(reload).not.toHaveBeenCalled();
  });

  test('Reload waits for the writes to Mine on their way', async () => {
    const reload = vi.fn<() => void>();
    const { promise: writes, resolve: written } = deferred();
    await render(<Toaster />);
    offerReload(reload, () => writes);
    await userEvent.click(page.getByRole('button', { name: 'Reload' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(reload).not.toHaveBeenCalled();
    written();
    await expect.poll(() => reload.mock.calls.length).toBe(1);
  });
});
