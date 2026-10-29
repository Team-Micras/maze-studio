import { afterEach, describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { ChangesChip } from '@/ui/changes/changes';
import { LibraryChrome } from '@/ui/library/library-chrome';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import '@/ui/styles.css';

afterEach(async () => {
  await page.viewport(1440, 900);
});

async function mountChrome(): Promise<void> {
  await render(
    <TooltipProvider>
      <LibraryChrome
        changes={<ChangesChip count={12} onToggle={() => undefined} open={false} phone={false} />}
        files={{
          onExportAll: () => undefined,
          onImport: () => undefined,
          onCheckUpdates: () => undefined,
        }}
        filter={{ query: '', source: 'mine', category: 'training' }}
        library={undefined}
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

describe("The notebook's top islands", () => {
  test.each([1860, 1440, 1100, 800])(
    'never overlap at %i px, with the Changes chip shown, and keep every filter in reach',
    async (width) => {
      await page.viewport(width, 900);
      await mountChrome();
      const chip = document.querySelector('[data-changes-chip]');
      const brand = boxOf(
        page.getByRole('heading', { name: 'Maze Studio' }).element().parentElement
      );
      const filters = document.querySelector('search > div');
      const actions = boxOf(chip?.parentElement);
      const middle = boxOf(filters);

      expect(chip).not.toBeNull();
      expect(brand.right).toBeLessThanOrEqual(middle.left);
      expect(middle.right).toBeLessThanOrEqual(actions.left);
      expect(actions.right).toBeLessThanOrEqual(width);
      filters?.scrollTo({ left: filters.scrollWidth });
      const training = page
        .getByRole('radio', { name: 'Training' })
        .element()
        .getBoundingClientRect();
      expect(training.right).toBeLessThanOrEqual(middle.right + 1);
    }
  );
});
