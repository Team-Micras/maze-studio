import { describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import '@/ui/styles.css';
import { TitleName } from '@/ui/editor/title-name';
import { axeViolations } from '@tests/support/axe-check';

function renamer() {
  return vi.fn<(name: string) => Promise<boolean>>(() => Promise.resolve(true));
}

describe('The title of a maze of My mazes', () => {
  test('turns into a field on click, and Enter saves the trimmed name', async () => {
    const onRename = renamer();
    await render(<TitleName name="Alpha" rename={{ taken: ['Beta'], onRename }} />);
    await userEvent.click(page.getByRole('button', { name: 'Alpha' }));
    const field = page.getByRole('textbox', { name: 'Maze name' });

    await expect.element(field).toHaveFocus();
    await userEvent.fill(field, '  Gamma  ');
    await userEvent.keyboard('{Enter}');

    expect(onRename).toHaveBeenCalledExactlyOnceWith('Gamma');
    await expect.element(page.getByRole('button', { name: 'Alpha' })).toHaveFocus();
  });

  test('refuses a name another maze has, in any case, and an empty one, beside the field', async () => {
    const onRename = renamer();
    await render(
      <header>
        <TitleName name="Alpha" rename={{ taken: ['Beta'], onRename }} />
      </header>
    );
    await userEvent.click(page.getByRole('button', { name: 'Alpha' }));
    const field = page.getByRole('textbox', { name: 'Maze name' });
    await userEvent.fill(field, 'beta');

    await expect.element(page.getByRole('alert')).toHaveTextContent('Name already in My mazes');
    await expect.element(field).toHaveAttribute('aria-invalid', 'true');
    expect(await axeViolations()).toEqual([]);
    await userEvent.keyboard('{Enter}');
    await userEvent.fill(field, ' ');
    await expect.element(page.getByRole('alert')).toHaveTextContent('Name cannot be empty');
    await userEvent.keyboard('{Enter}');

    expect(onRename).not.toHaveBeenCalled();
  });

  test('Escape puts the name back without renaming', async () => {
    const onRename = renamer();
    await render(<TitleName name="Alpha" rename={{ taken: [], onRename }} />);
    await userEvent.click(page.getByRole('button', { name: 'Alpha' }));
    await userEvent.fill(page.getByRole('textbox', { name: 'Maze name' }), 'Other');
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent('Alpha');
    expect(onRename).not.toHaveBeenCalled();
  });

  test('is plain text for a maze not in My mazes', async () => {
    await render(<TitleName name="AAMC15Maze" />);

    await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent('AAMC15Maze');
    expect(document.querySelector('h1 button')).toBeNull();
  });
});
