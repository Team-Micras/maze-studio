import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { RenameDialog } from '@/ui/editor/rename-dialog';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';

async function mount(): Promise<string[]> {
  const renamed: string[] = [];
  await render(
    <RenameDialog
      name="Practice"
      onOpenChange={() => undefined}
      onRename={(name) => {
        renamed.push(name);
        return Promise.resolve(true);
      }}
      open
      taken={['Shared one', 'Untitled maze']}
    />
  );
  return renamed;
}

describe('The Rename dialog', () => {
  test('refuses a name another maze of Mine has, in any case, beside the field', async () => {
    const renamed = await mount();
    const field = page.getByRole('textbox', { name: 'Name' });
    await userEvent.fill(field, 'shared ONE');

    await expect.element(page.getByText('Name already in Mine. Pick another')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect.element(field).toHaveAttribute('aria-invalid', 'true');
    expect(await axeViolations()).toEqual([]);
    await userEvent.keyboard('{Enter}');
    expect(renamed).toEqual([]);
  });

  test('refuses an empty name, and saves a free one with Enter', async () => {
    const renamed = await mount();
    const field = page.getByRole('textbox', { name: 'Name' });
    await userEvent.fill(field, '   ');

    await expect.element(page.getByText('Name cannot be empty')).toBeVisible();
    await userEvent.fill(field, ' Practice run ');
    await userEvent.keyboard('{Enter}');
    expect(renamed).toEqual(['Practice run']);
  });
});
