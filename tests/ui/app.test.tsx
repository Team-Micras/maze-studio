import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { MAZEFILES } from '@/library/mazefiles';
import { App } from '@/ui/app';
import '@/ui/styles.css';
import { seriousViolations } from '@tests/support/axe-check';

test('shows the name of the app and credits the mazefiles repository', async () => {
  await render(<App />);

  await expect.element(page.getByRole('heading', { level: 1, name: 'maze-studio' })).toBeVisible();
  const credit = page.getByRole('link', { name: 'micromouseonline/mazefiles' });
  await expect.element(credit).toHaveAttribute('href', MAZEFILES.url);
});

test('has no serious accessibility violations', async () => {
  document.documentElement.classList.add('dark');
  await render(<App />);

  expect(await seriousViolations()).toEqual([]);
});
