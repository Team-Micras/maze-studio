import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { ToolsIsland, type Tool } from '@/ui/editor/tools-island';
import type { BoardKey } from '@/ui/editor/use-board-keys';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';

interface Mounted {
  readonly tools: Tool[];
  readonly keys: BoardKey[];
}

async function mount(phone = false): Promise<Mounted> {
  const tools: Tool[] = [];
  const keys: BoardKey[] = [];
  await render(
    <TooltipProvider>
      <footer>
        <ToolsIsland
          canRedo={false}
          canUndo
          editable
          onBoardKey={(key) => keys.push(key)}
          onRedo={() => undefined}
          onTool={(tool) => tools.push(tool)}
          onUndo={() => undefined}
          phone={phone}
          tool="wall"
          {...(phone ? { onView: () => undefined } : {})}
        />
      </footer>
    </TooltipProvider>
  );
  return { tools, keys };
}

function focusedLabel(): string | null | undefined {
  return document.activeElement?.getAttribute('aria-label');
}

describe('The tools island', () => {
  test('is a toolbar whose tools are radios, the active one checked', async () => {
    await mount();

    await expect.element(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
    await expect.element(page.getByRole('radio', { name: 'Wall' })).toBeChecked();
    await expect.element(page.getByRole('radio', { name: 'Hand' })).not.toBeChecked();
    expect(await axeViolations()).toEqual([]);
  });

  test('moves the focus with ← and →, and leaves the board alone', async () => {
    const { keys } = await mount();
    page.getByRole('radio', { name: 'Hand' }).element().focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(focusedLabel()).toBe('Wall');
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedLabel()).toBe('Undo');
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedLabel()).toBe('Wall');
    expect(keys).toEqual([]);
  });

  test('hands ↑, ↓ and every Shift and arrow to the board', async () => {
    const { keys } = await mount();
    page.getByRole('radio', { name: 'Wall' }).element().focus();
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Shift>}{ArrowRight}{ArrowLeft}{/Shift}');

    expect(keys).toEqual([
      { key: 'ArrowDown', shiftKey: false },
      { key: 'ArrowUp', shiftKey: false },
      { key: 'ArrowRight', shiftKey: true },
      { key: 'ArrowLeft', shiftKey: true },
    ]);
    expect(focusedLabel()).toBe('Wall');
  });

  test('never leaves no tool: a click on the active one keeps it', async () => {
    const { tools } = await mount();
    await userEvent.click(page.getByRole('radio', { name: 'Wall' }));
    await userEvent.click(page.getByRole('radio', { name: 'Hand' }));

    expect(tools).toEqual(['hand']);
  });

  test('on a phone, has the way back to viewing and no hand', async () => {
    await mount(true);

    await expect
      .element(page.getByRole('button', { name: 'Done editing, back to viewing' }))
      .toBeVisible();
    expect(document.querySelector('[aria-label="Hand"]')).toBeNull();
  });
});
