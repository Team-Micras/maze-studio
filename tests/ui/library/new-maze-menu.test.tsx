import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { CustomSizeDialog } from '@/ui/library/new-maze-menu';
import type { NewMazeRequest } from '@/ui/new-maze';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';

async function mount(): Promise<NewMazeRequest[]> {
  const created: NewMazeRequest[] = [];
  await render(
    <CustomSizeDialog
      defaultName="Untitled maze 2"
      onCreate={(request) => created.push(request)}
      onOpenChange={() => undefined}
      open
    />
  );
  return created;
}

describe('The Custom size dialog', () => {
  test('focuses the width, and creates a 7 × 5 with the rules and name given on Enter', async () => {
    const created = await mount();
    await expect.element(page.getByRole('spinbutton', { name: 'Width' })).toHaveFocus();
    await userEvent.fill(page.getByRole('spinbutton', { name: 'Width' }), '7');
    await userEvent.fill(page.getByRole('spinbutton', { name: 'Height' }), '5');
    await userEvent.click(page.getByRole('radio', { name: 'Training' }));
    await userEvent.click(page.getByRole('spinbutton', { name: 'Width' }));
    await userEvent.keyboard('{Enter}');

    expect(created).toEqual([
      { kind: 'custom', width: 7, height: 5, profile: 'training', name: 'Untitled maze 2' },
    ]);
  });

  test.each(['0', '65', '', '2.5'])(
    'says "1 to 64" for a width of "%s" and disables Create',
    async (width) => {
      const created = await mount();
      await userEvent.fill(page.getByRole('spinbutton', { name: 'Width' }), width);

      await expect.element(page.getByText('1 to 64')).toBeVisible();
      await expect.element(page.getByRole('button', { name: 'Create' })).toBeDisabled();
      await userEvent.keyboard('{Enter}');
      expect(created).toEqual([]);
    }
  );

  test('has no accessibility violations', async () => {
    await mount();

    expect(await axeViolations()).toEqual([]);
  });
});
