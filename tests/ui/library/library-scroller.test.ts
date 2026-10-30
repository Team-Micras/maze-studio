import { afterEach, expect, test, vi } from 'vitest';

import { libraryFlung, noteLibraryScroll } from '@/ui/library/library-scroller';

afterEach(() => {
  vi.restoreAllMocks();
});

test('counts the grid as flung while it scrolls fast, and not once it stops or crawls', () => {
  const now = vi.spyOn(performance, 'now');
  now.mockReturnValue(10_000);
  noteLibraryScroll(0);
  expect(libraryFlung()).toBe(false);

  now.mockReturnValue(10_016);
  noteLibraryScroll(200);
  expect(libraryFlung()).toBe(true);

  now.mockReturnValue(10_200);
  expect(libraryFlung()).toBe(false);

  noteLibraryScroll(210);
  expect(libraryFlung()).toBe(false);
});
