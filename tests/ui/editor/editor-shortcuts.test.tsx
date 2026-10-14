import { expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { useEditorShortcuts } from '@/ui/editor/use-editor-shortcuts';

const calls: string[] = [];

const list = {
  onOpen: () => calls.push('open'),
  onStep: (step: 1 | -1) => calls.push(`step ${step}`),
};

function Harness({ active }: { readonly active: boolean }) {
  useEditorShortcuts({
    list,
    active,
    hand: true,
    onUndo: () => calls.push('undo'),
    onRedo: () => undefined,
    onTool: () => undefined,
    onCloseBorder: () => undefined,
    onToggleDiff: () => undefined,
  });
  return <input aria-label="Name" />;
}

test('L, [ and ] work the list while the maze is only looked at, never in a text field', async () => {
  calls.length = 0;
  const screen = await render(<Harness active={false} />);
  await userEvent.keyboard('l[[]{Control>}z{/Control}');
  expect(calls).toEqual(['open', 'step -1', 'step 1']);

  await screen.getByRole('textbox', { name: 'Name' }).click();
  await userEvent.keyboard('l]');
  expect(calls).toEqual(['open', 'step -1', 'step 1']);
});
