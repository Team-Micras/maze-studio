import { describe, expect, test } from 'vitest';

import { databaseFor, PREVIEW_PATH, registersServiceWorker } from '@/preview';

describe('previews of pull requests', () => {
  test('are told apart by their path, which the service worker leaves to the network', () => {
    expect(PREVIEW_PATH.test('/maze-studio/pr-12/')).toBe(true);
    expect(PREVIEW_PATH.test('/maze-studio/pr-12/index.html')).toBe(true);
    expect(PREVIEW_PATH.test('/maze-studio/')).toBe(false);
    expect(PREVIEW_PATH.test('/maze-studio/pr-/')).toBe(false);
    expect(PREVIEW_PATH.test('/maze-studio/assets/pr-1.js')).toBe(false);
  });

  test('register no service worker, and the site does', () => {
    expect(registersServiceWorker('/maze-studio/pr-7/')).toBe(false);
    expect(registersServiceWorker('/maze-studio/')).toBe(true);
    expect(registersServiceWorker('/')).toBe(true);
  });

  test('keep a database of their own, apart from the site', () => {
    expect(databaseFor('maze-studio', '/maze-studio/pr-7/')).toBe('maze-studio-pr-7');
    expect(databaseFor('maze-studio', '/maze-studio/')).toBe('maze-studio');
  });
});
