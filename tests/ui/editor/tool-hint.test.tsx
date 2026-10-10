import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { SpokenHint, type HintMessage } from '@/ui/editor/tool-hint';

function spoken(): string | null | undefined {
  return document.querySelector('p[aria-live="polite"]')?.textContent;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('The spoken hint', () => {
  test('says a refusal, and says it again when it comes again', async () => {
    const first: HintMessage = { text: 'Zoom in to edit', at: 1, spoken: true };
    const screen = await render(<SpokenHint message={first} />);

    await expect.poll(spoken).toBe('Zoom in to edit');
    const region = document.querySelector('p[aria-live="polite"]');
    const texts: string[] = [];
    const observer = new MutationObserver(() => texts.push(region?.textContent ?? ''));
    observer.observe(region ?? document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    await screen.rerender(<SpokenHint message={{ ...first, at: 2 }} />);
    await nextFrame();
    await expect.poll(spoken).toBe('Zoom in to edit');
    observer.disconnect();

    expect(texts).toEqual(['', 'Zoom in to edit']);
  });

  test('keeps quiet for the hints that are only shown', async () => {
    await render(<SpokenHint message={{ text: 'Drag to pan', at: 1 }} />);
    await nextFrame();
    await nextFrame();

    expect(spoken()).toBe('');
  });
});
