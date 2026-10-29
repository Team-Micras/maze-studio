import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { Hint } from '@/ui/islands/island';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import '@/ui/styles.css';

const COARSE = '(pointer: coarse)';

const pointer = { coarse: false };

beforeAll(() => {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const list = real(query);

    if (query === COARSE) {
      Object.defineProperty(list, 'matches', { get: () => pointer.coarse });
    }

    return list;
  });
});

afterEach(() => {
  pointer.coarse = false;
});

async function mountHint(): Promise<void> {
  await render(
    <TooltipProvider delayDuration={0}>
      <Hint label="Maze list" shortcut="L">
        <button aria-label="Maze list" type="button">
          L
        </button>
      </Hint>
    </TooltipProvider>
  );
}

describe('Hint', () => {
  test('shows its tooltip when the control takes the focus from the keyboard', async () => {
    await mountHint();
    await userEvent.tab();

    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Maze list');
  });

  test('shows no tooltip on a coarse pointer, and the control keeps its name', async () => {
    pointer.coarse = true;
    await mountHint();
    await userEvent.tab();
    await new Promise((resolve) => setTimeout(resolve, 300));

    await expect.element(page.getByRole('button', { name: 'Maze list' })).toHaveFocus();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
