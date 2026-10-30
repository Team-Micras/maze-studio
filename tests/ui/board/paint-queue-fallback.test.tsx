import { afterAll, beforeAll, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

const requestIdle = window.requestIdleCallback;

beforeAll(() => {
  Reflect.deleteProperty(window, 'requestIdleCallback');
});

afterAll(() => {
  window.requestIdleCallback = requestIdle;
});

test('paints a thumbnail the cache lacks in a browser without requestIdleCallback', async () => {
  expect(typeof window.requestIdleCallback).toBe('undefined');
  const { ThumbnailCanvas } = await import('@/ui/board/thumbnail-canvas');
  const maze = await repoMaze(REPO_MAZES.taiwan);
  await render(<ThumbnailCanvas height={200} maze={maze} width={200} />);
  const canvas = document.querySelector('canvas');

  await expect.poll(() => canvas?.hasAttribute('data-painted'), { timeout: 2000 }).toBe(true);
  expect(canvas?.width).toBe(256);
});
