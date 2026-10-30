import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { SearchIndex } from '@/library';
import { libraryLayout } from '@/render';
import { ChangesChip } from '@/ui/changes/changes';
import { LibraryChrome } from '@/ui/library/library-chrome';
import type { Library } from '@/ui/library/use-library';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import '@/ui/styles.css';

afterEach(async () => {
  await page.viewport(1440, 900);
});

/** A library with many mazes of My mazes, which widen the source filter. */
const WIDE: Library = {
  entries: [],
  index: new SearchIndex([]),
  mazeOf: () => undefined,
  documentOf: () => undefined,
  commit: '070f716b2f6e0a1a4c1a0b7c7d2a3e4f5a6b7c8d',
  repoCount: 583,
  mineCount: 120,
};

async function mountChrome(): Promise<void> {
  await render(
    <TooltipProvider>
      <LibraryChrome
        changes={<ChangesChip count={99} onToggle={() => undefined} open={false} phone={false} />}
        files={{
          onExportAll: () => undefined,
          onImport: () => undefined,
          onCheckUpdates: () => undefined,
        }}
        filter={{ query: '', source: 'mine', category: 'training' }}
        library={WIDE}
        newName="Untitled maze"
        onFilter={() => undefined}
        onNew={() => undefined}
        onOpenFile={() => undefined}
        phone={false}
        visible
      />
    </TooltipProvider>
  );
}

function boxOf(element: Element | null | undefined): DOMRect {
  return element?.getBoundingClientRect() ?? new DOMRect();
}

function apart(a: DOMRect, b: DOMRect): boolean {
  return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
}

describe("The notebook's top islands", () => {
  test.each([1340, 1339, 721])(
    'never overlap at %i px with the widest Changes chip, show every filter, and end above the grid',
    async (width) => {
      await page.viewport(width, 900);
      await mountChrome();
      const chip = document.querySelector('[data-changes-chip]');
      const brand = boxOf(
        page.getByRole('heading', { name: 'Maze Studio' }).element().parentElement
      );
      const filters = boxOf(document.querySelector('search > div'));
      const actions = boxOf(chip?.parentElement);
      const tabs = [...document.querySelectorAll('search [role="radio"]')].map((tab) =>
        tab.getBoundingClientRect()
      );

      expect(chip).not.toBeNull();
      expect(apart(brand, filters) && apart(filters, actions) && apart(brand, actions)).toBe(true);
      expect(actions.right).toBeLessThanOrEqual(width);
      expect(tabs).toHaveLength(6);
      for (const tab of tabs) {
        expect(tab.left).toBeGreaterThanOrEqual(filters.left);
        expect(tab.right).toBeLessThanOrEqual(filters.right);
      }
      expect(filters.bottom).toBeLessThan(
        libraryLayout(width, width >= 1340 ? 'notebook' : 'stacked', 1).insets.top
      );
    }
  );
});
