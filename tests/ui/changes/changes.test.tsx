import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { createMaze, toggleWall } from '@/maze';
import { ChangesChip, ChangesPanel, DISCARD_ARMED_MS, type ChangeRow } from '@/ui/changes/changes';
import type { ChangeItem } from '@/ui/changes/session-changes';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';

const BASE = createMaze({ width: 6, height: 6 });

const COPY: ChangeItem = {
  id: 'u-1',
  kind: 'copy',
  name: 'test (edited)',
  baseline: BASE,
  source: { kind: 'repo', path: 'classic/test.txt' },
};

const NEW: ChangeItem = {
  id: 'u-2',
  kind: 'new',
  name: 'Untitled maze',
  baseline: undefined,
  source: undefined,
};

const ROWS: readonly ChangeRow[] = [
  { item: COPY, current: toggleWall(BASE, { direction: 'horizontal', x: 1, y: 1 }) },
  { item: NEW, current: BASE },
];

interface Heard {
  readonly opened: string[];
  readonly kept: string[];
  readonly discarded: string[];
}

async function mount(rows: readonly ChangeRow[] = ROWS, phone = false): Promise<Heard> {
  const heard: Heard = { opened: [], kept: [], discarded: [] };
  await render(
    <TooltipProvider>
      <main>
        <ChangesPanel
          canShowDiff
          onDiscard={(item) => heard.discarded.push(item.id)}
          onKeep={(item) => heard.kept.push(item.id)}
          onOpenChange={() => undefined}
          onOpenItem={(item) => heard.opened.push(item.id)}
          onShowDiff={() => undefined}
          open
          phone={phone}
          rows={rows}
          showDiff={false}
        />
      </main>
    </TooltipProvider>
  );
  return heard;
}

describe('The Changes chip', () => {
  test('counts the changes, and hides with none', async () => {
    const screen = await render(<ChangesChip count={2} onToggle={() => undefined} open={false} />);

    await expect
      .element(page.getByRole('button', { name: 'Changes in this session: 2' }))
      .toHaveTextContent('2 changed');
    await screen.rerender(<ChangesChip count={0} onToggle={() => undefined} open={false} />);
    expect(document.querySelector('[data-changes-chip]')).toBeNull();
  });
});

describe('The Changes panel', () => {
  test('lists each change with what changed, and has no accessibility violations', async () => {
    await mount();

    await expect.element(page.getByText('1 wall added')).toBeVisible();
    await expect.element(page.getByText('New maze')).toBeVisible();
    expect(document.querySelectorAll('[data-change] canvas')).toHaveLength(2);
    expect(await axeViolations()).toEqual([]);
  });

  test('discards on the second click only, and disarms after 3 s', async () => {
    const heard = await mount();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    try {
      await userEvent.click(page.getByRole('button', { name: 'Discard test (edited)' }));
      expect(heard.discarded).toEqual([]);
      await expect
        .element(page.getByRole('button', { name: 'Confirm discard of test (edited)' }))
        .toBeVisible();
      vi.advanceTimersByTime(DISCARD_ARMED_MS);
      await expect
        .element(page.getByRole('button', { name: 'Discard test (edited)' }))
        .toBeVisible();
      await userEvent.click(page.getByRole('button', { name: 'Discard test (edited)' }));
      await userEvent.click(page.getByRole('button', { name: 'Confirm discard of test (edited)' }));
    } finally {
      vi.useRealTimers();
    }

    expect(heard.discarded).toEqual(['u-1']);
  });

  test('keeps and opens an item', async () => {
    const heard = await mount();
    await userEvent.click(page.getByRole('button', { name: 'Keep Untitled maze' }));
    await userEvent.click(page.getByRole('button', { name: 'Open test (edited)' }));

    expect(heard.kept).toEqual(['u-2']);
    expect(heard.opened).toEqual(['u-1']);
  });

  test('says when nothing changed, as a sheet on a phone', async () => {
    await mount([], true);

    await expect
      .element(page.getByRole('dialog', { name: 'Changes in this session' }))
      .toBeVisible();
    await expect.element(page.getByText('Nothing changed since the app opened.')).toBeVisible();
    expect(await axeViolations()).toEqual([]);
  });
});
