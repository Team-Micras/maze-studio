import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { Check } from '@/ui/icons';

describe('An icon', () => {
  test('is hidden from screen readers unless told otherwise, and takes its size', async () => {
    await render(
      <>
        <Check data-testid="plain" size={18} />
        <Check aria-hidden={false} data-testid="spoken" />
      </>
    );
    const plain = document.querySelector('[data-testid="plain"]');

    expect(plain?.getAttribute('aria-hidden')).toBe('true');
    expect(plain?.getAttribute('width')).toBe('18');
    expect(document.querySelector('[data-testid="spoken"]')?.getAttribute('aria-hidden')).toBe(
      'false'
    );
  });
});
