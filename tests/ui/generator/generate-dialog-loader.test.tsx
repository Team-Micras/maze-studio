import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { GeneratorUnavailable, UNAVAILABLE } from '@/ui/generator/generate-dialog-loader';
import { useToasts } from '@/ui/toasts';

describe('The Generate dialog when its chunk does not load', () => {
  test('says so and closes at every open', async () => {
    const closed: boolean[] = [];
    const props = { onOpenChange: (open: boolean) => closed.push(open), onUse: () => undefined };
    const screen = await render(<GeneratorUnavailable {...props} open />);
    await screen.rerender(<GeneratorUnavailable {...props} open={false} />);
    await screen.rerender(<GeneratorUnavailable {...props} open />);

    expect(closed).toEqual([false, false]);
    expect(useToasts.getState().toasts.filter((toast) => toast.text === UNAVAILABLE)).toHaveLength(
      2
    );
  });
});
