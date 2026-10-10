import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { Verbatim } from '@/ui/verbatim';

async function shown(text: string, verbatim?: string | readonly string[]): Promise<HTMLElement> {
  const { container } = await render(
    <p>
      <Verbatim text={text} verbatim={verbatim} />
    </p>
  );
  return container;
}

function untranslated(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('[translate="no"]')].map((span) => span.textContent);
}

describe('Verbatim', () => {
  test('marks every occurrence of each part, and keeps the sentence whole', async () => {
    const container = await shown('Copy a.txt (a.txt) to b(1).txt', ['a.txt', 'b(1).txt']);

    expect(container.textContent).toBe('Copy a.txt (a.txt) to b(1).txt');
    expect(untranslated(container)).toEqual(['a.txt', 'a.txt', 'b(1).txt']);
  });

  test('leaves the text alone without a part, or with one it does not hold', async () => {
    expect(untranslated(await shown('Saved', undefined))).toEqual([]);
    expect(untranslated(await shown('Saved', 'x.txt'))).toEqual([]);
    expect(untranslated(await shown('Saved', ''))).toEqual([]);
  });
});
