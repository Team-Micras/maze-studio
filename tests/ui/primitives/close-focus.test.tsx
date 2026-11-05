import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';
import '@/ui/styles.css';

async function mount(): Promise<Element> {
  await render(
    <div className="p-10">
      <DropdownMenu>
        <DropdownMenuTrigger>More</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  return page.getByRole('button', { name: 'More' }).element();
}

describe('An overlay that closes', () => {
  test('leaves the focus off its trigger after an item is clicked, so no ring shows on it', async () => {
    const trigger = await mount();
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('menuitem', { name: 'One' }));

    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(trigger);
  });

  test('puts the focus back on its trigger after Escape', async () => {
    const trigger = await mount();
    if (trigger instanceof HTMLElement) {
      trigger.focus();
    }
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByRole('menuitem', { name: 'One' })).toBeVisible();
    await userEvent.keyboard('{Escape}');

    await expect.element(page.getByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});
