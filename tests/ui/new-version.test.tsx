import { afterEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import '@/ui/styles.css';
import { offerReload } from '@/ui/new-version';
import { Toaster } from '@/ui/toaster';
import { showToast, TOAST_DURATION_MS, useToasts } from '@/ui/toasts';

afterEach(() => {
  useToasts.setState({ toasts: [] });
});

function shown(text: string): number {
  return [...document.querySelectorAll('ol li')].filter((item) => item.textContent?.includes(text))
    .length;
}

describe('A new version', () => {
  test('stays as "New version. Reload" past a toast\'s time, and Reload runs the update', async () => {
    const reload = vi.fn<() => void>();
    await render(<Toaster />);
    offerReload(reload);
    showToast('Saved to a.txt');
    await expect.poll(() => shown('New version.')).toBe(1);
    await expect.poll(() => shown('Saved to a.txt')).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, TOAST_DURATION_MS + 600));
    expect(shown('Saved to a.txt')).toBe(0);
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
});
