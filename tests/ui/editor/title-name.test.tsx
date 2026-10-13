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

  test('lets Tab leave the field, closing it without taking the focus back', async () => {
    const onRename = renamer();
    await render(
      <header>
        <TitleName name="Alpha" rename={{ taken: [], onRename }} />
        <button type="button">Next</button>
      </header>
    );
    await userEvent.click(page.getByRole('button', { name: 'Alpha' }));
    await userEvent.tab();
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect.element(page.getByRole('button', { name: 'Next' })).toHaveFocus();
    expect(document.querySelector('input')).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  test('keeps a heading while the field is open, and the name typed when the rename fails', async () => {
    const onRename = vi.fn<(name: string) => Promise<boolean>>(() => Promise.resolve(false));
    await render(<TitleName name="Alpha" rename={{ taken: [], onRename }} />);
    await userEvent.click(page.getByRole('button', { name: 'Alpha' }));

    await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent('Alpha');
    await userEvent.fill(page.getByRole('textbox', { name: 'Maze name' }), 'Gamma');
    await userEvent.keyboard('{Enter}');

    await expect.element(page.getByRole('textbox', { name: 'Maze name' })).toHaveValue('Gamma');
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Gamma');
  });

  test('draws its focus ring whole, and takes a touch 44 px tall', async () => {
    await render(
      <div style={{ padding: 40 }}>
        <TitleName name="Alpha" rename={{ taken: [], onRename: renamer() }} />
      </div>
    );
    const button = page.getByRole('button', { name: 'Alpha' }).element();
    const box = button.getBoundingClientRect();
    const middle = box.left + box.width / 2;

    expect(getComputedStyle(button.parentElement ?? button).overflow).toBe('visible');
    expect(document.elementFromPoint(middle, box.top - 12)).toBe(button);
    expect(document.elementFromPoint(middle, box.bottom + 12)).toBe(button);
  });
});
