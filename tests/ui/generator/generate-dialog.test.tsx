import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { readRecipe } from '@/generator';
import { borderedMaze, toggleWall } from '@/maze';
import type { Generated } from '@/ui/editor/edit-session';
import GenerateDialog, { type GeneratorPreview } from '@/ui/generator/generate-dialog';
import type { NewMazeRequest } from '@/ui/new-maze';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';

const GENERATION = { timeout: 50_000 };

async function mount(): Promise<NewMazeRequest[]> {
  const used: NewMazeRequest[] = [];
  await render(
    <GenerateDialog onOpenChange={() => undefined} onUse={(request) => used.push(request)} open />
  );
  return used;
}

const BOARD = toggleWall(
  toggleWall(borderedMaze(32, 32), { direction: 'horizontal', x: 3, y: 3 }),
  {
    direction: 'vertical',
    x: 3,
    y: 3,
  }
);

async function generate(seed = '1'): Promise<void> {
  await userEvent.fill(page.getByRole('spinbutton', { name: 'First seed' }), seed);
  await userEvent.click(page.getByRole('button', { name: 'Generate', exact: true }));
}

/** Opens the card of maze `place` in the detail view. */
async function open(place: number): Promise<void> {
  await userEvent.click(page.getByRole('button', { name: new RegExp(`^#${place},`) }));
}

describe('The Generate dialog', () => {
  test('shows its settings with every rule and fine tuning field, focuses Generate, and has no accessibility violations', async () => {
    await mount();

    await expect.element(page.getByRole('button', { name: 'Generate', exact: true })).toHaveFocus();
    await expect.element(page.getByText('Beta')).toBeVisible();
    await userEvent.click(page.getByText('Rules', { exact: true }));
    await userEvent.click(page.getByText('Fine tuning'));
    await expect.element(page.getByRole('switch', { name: 'Never trivial' })).toBeChecked();
    await expect
      .element(page.getByRole('radiogroup', { name: 'Zigzag' }).getByRole('radio', { name: 'Mix' }))
      .toBeChecked();

    expect(await axeViolations()).toEqual([]);
  });

  test('says when a range does not read and keeps Generate off until it does', async () => {
    await mount();
    await userEvent.fill(
      page.getByRole('spinbutton', { name: 'Shortest path, in cells, from' }),
      '120'
    );

    await expect
      .element(page.getByText('Whole numbers from 1 to 999, the first not above the second'))
      .toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Generate', exact: true }))
      .toBeDisabled();
    await userEvent.fill(
      page.getByRole('spinbutton', { name: 'Shortest path, in cells, from' }),
      '70'
    );
    await expect.element(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled();
    await expect
      .element(page.getByRole('combobox', { name: 'Preset' }))
      .toHaveDisplayValue('Custom (from Recommended)');
    await expect.element(page.getByRole('combobox', { name: 'Preset' })).toBeVisible();
  });

  test('builds a batch in workers, shows its cards with their tags, and opens the one picked', async () => {
    const used = await mount();
    await generate();

    await expect.poll(building).toBe(true);
    await expect.element(page.getByRole('button', { name: /^#8,/ }), GENERATION).toBeVisible();
    await expect.poll(building, GENERATION).toBe(false);
    await expect.element(page.getByText('Seeds 1–8').first()).toBeVisible();
    expect(page.getByRole('button', { name: 'Use this' }).query()).toBeNull();
    expect(await axeViolations()).toEqual([]);

    await open(3);
    await expect.element(page.getByRole('heading', { name: /^#3 of 8 ·/ })).toHaveFocus();
    await userEvent.click(page.getByRole('button', { name: 'Use this' }));

    expect(used).toHaveLength(1);
    expect(used[0]).toMatchObject({ kind: 'generated', profile: 'classic' });
    expect(used[0]?.kind === 'generated' ? used[0].recipe : undefined).toMatchObject({
      version: 7,
      seed: 3,
      settings: { size: 16 },
    });
  });

  test('shows each maze in its card as it is built, before the batch is done', async () => {
    await mount();
    await generate();
    await expect.element(page.getByRole('button', { name: /^#1,/ }), GENERATION).toBeVisible();

    expect(building()).toBe(true);
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
  });

  test('keeps the status row and the gallery still as a run starts and ends', async () => {
    await mount();
    await generate();
    await expect.poll(building, GENERATION).toBe(false);
    const height = statusHeight();
    const top = galleryTop();

    await userEvent.click(page.getByRole('button', { name: '8 more' }));
    await expect.poll(building).toBe(true);
    expect([statusHeight(), galleryTop()]).toEqual([height, top]);
    await expect.poll(building, GENERATION).toBe(false);
    expect([statusHeight(), galleryTop()]).toEqual([height, top]);
  });

  test('opens a maze drawn large in a view of its own, steps with ‹ › and the arrow keys, and goes back to the gallery where it was', async () => {
    const used = await mount();
    await generate();
    await expect.poll(building, GENERATION).toBe(false);
    const body = document.querySelector('[data-generate] .overflow-y-auto');
    body?.scrollTo({ top: 120 });
    const scrolled = body?.scrollTop;
    await open(3);

    await expect.element(page.getByRole('img', { name: 'Maze #3, seed 3' })).toBeVisible();
    await expect.element(page.getByRole('region', { name: /^#3 of 8 ·/ })).toBeVisible();
    expect(await axeViolations()).toEqual([]);
    await userEvent.click(page.getByRole('button', { name: 'Next maze' }));
    await expect.element(page.getByRole('heading', { name: /^#4 of 8 ·/ })).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(page.getByRole('img', { name: 'Maze #5, seed 5' })).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(page.getByRole('heading', { name: /^#4 of 8 ·/ })).toBeVisible();

    await userEvent.click(page.getByRole('button', { name: 'Back to the mazes' }));
    await expect.element(page.getByRole('button', { name: /^#4,/ })).toHaveFocus();
    expect(body?.scrollTop).toBe(scrolled);

    await open(1);
    await expect.element(page.getByRole('button', { name: 'Previous maze' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await expect.element(page.getByRole('list', { name: 'Mazes generated' })).toBeVisible();
    await open(8);
    await userEvent.click(page.getByRole('button', { name: 'Use this' }));
    expect(used[0]?.kind === 'generated' ? used[0].recipe.seed : undefined).toBe(8);
  });

  test('fits the maze and its details above the footer on a phone', async () => {
    await page.viewport(390, 844);
    await mount();
    await generate();
    await expect.poll(building, GENERATION).toBe(false);
    await open(3);
    const lists = document.querySelectorAll('[data-detail] ul');
    const bottom = lists[lists.length - 1]?.getBoundingClientRect().bottom ?? Infinity;
    const footer = page.getByRole('button', { name: 'Use this' }).element().getBoundingClientRect();

    expect(bottom).toBeLessThanOrEqual(footer.top);
    await page.viewport(1440, 900);
  });

  test('loads 8 more with › past the last maze, keeping #1 to #8, and lands on #9', async () => {
    await mount();
    await generate();
    await expect.poll(building, GENERATION).toBe(false);
    await open(8);
    await userEvent.click(page.getByRole('button', { name: 'Next maze, building 8 more' }));

    await expect
      .element(page.getByRole('heading', { name: /^#9 of 16 · seed 9/ }), GENERATION)
      .toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Previous maze' }));
    await expect.element(page.getByRole('heading', { name: /^#8 of 16 · seed 8/ })).toBeVisible();
    expect(await axeViolations()).toEqual([]);
  });

  test('opens the settings as a view of their own and comes back to the mazes, focus following', async () => {
    await mount();
    await generate();
    await expect.poll(building, GENERATION).toBe(false);

    expect(document.querySelector('[data-settings]')).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Settings' }));
    await expect.element(page.getByRole('combobox', { name: 'Preset' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Back to the mazes' })).toHaveFocus();
    await expect.element(page.getByRole('dialog', { name: 'Generate' })).toBeVisible();
    expect(await axeViolations()).toEqual([]);

    await userEvent.click(page.getByRole('button', { name: 'Back to the mazes' }));
    expect(document.querySelector('[data-settings]')).toBeNull();
    await expect.element(page.getByRole('button', { name: 'Settings' })).toHaveFocus();
  });

  test('docked beside the editor, previews the maze opened or hovered, without a board of its own, and nothing once closed', async () => {
    const previews: (GeneratorPreview | undefined)[] = [];
    const board = borderedMaze(16, 16);
    const props = {
      board,
      onOpenChange: () => undefined,
      onPreview: (preview: GeneratorPreview | undefined) => previews.push(preview),
      onReplace: () => undefined,
      onUse: () => undefined,
    };
    const screen = await render(<GenerateDialog {...props} open />);
    await generate();
    await expect.poll(building, GENERATION).toBe(false);
    await expect.poll(() => previews.at(-1)?.seed).toBe(1);
    await userEvent.hover(page.getByRole('button', { name: /^#5,/ }));
    await expect.poll(() => previews.at(-1)?.seed).toBe(5);
    await userEvent.unhover(page.getByRole('button', { name: /^#5,/ }));
    await expect.poll(() => previews.at(-1)?.seed).toBe(1);
    await open(2);
    await expect.poll(() => previews.at(-1)?.seed).toBe(2);

    expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeNull();
    expect(document.querySelector('[data-detail] svg[data-board]')).toBeNull();
    await expect
      .element(page.getByRole('button', { name: 'Back to the board' }))
      .toBeInTheDocument();
    expect(await axeViolations()).toEqual([]);

    await screen.rerender(<GenerateDialog {...props} open={false} />);
    await expect.poll(() => previews.at(-1)).toBeUndefined();
  });

  test('appends 8 more from the gallery and moves to #9, unless another maze was opened meanwhile', async () => {
    await mount();
    await generate();
    await expect.poll(building, GENERATION).toBe(false);
    await userEvent.click(page.getByRole('button', { name: '8 more' }));
    await expect
      .element(page.getByRole('button', { name: /^#9,/ }), GENERATION)
      .toHaveAttribute('aria-pressed', 'true');
    await expect.poll(building, GENERATION).toBe(false);
    expect(document.querySelectorAll('ol[aria-label="Mazes generated"] > li')).toHaveLength(16);

    await userEvent.click(page.getByRole('button', { name: '8 more' }));
    await open(3);
    await expect.poll(building, GENERATION).toBe(false);
    await expect.element(page.getByRole('heading', { name: /^#3 of 24 ·/ })).toBeVisible();
  });

  test('cancels a run, leaving no card behind', async () => {
    await mount();
    await generate();
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

    await expect
      .element(page.getByRole('list', { name: 'Mazes generated' }))
      .not.toBeInTheDocument();
    expect(building()).toBe(false);
  });

  test('rebuilds a recipe, warns when it rebuilds other walls, and refuses what is not one', async () => {
    await mount();
    await generate();
    await expect.element(page.getByRole('button', { name: /^#1,/ }), GENERATION).toBeVisible();
    await open(1);
    const text = await navigatorRecipe();
    await userEvent.click(page.getByRole('button', { name: 'Settings' }));
    await userEvent.click(page.getByText('Rebuild from a recipe'));
    await userEvent.fill(page.getByRole('textbox', { name: 'Recipe' }), 'not json');
    await userEvent.click(page.getByRole('button', { name: 'Rebuild' }));
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('This is not a recipe: copy it again with “Copy recipe”');

    const recipe = readRecipe(text);
    await userEvent.fill(
      page.getByRole('textbox', { name: 'Recipe' }),
      JSON.stringify({ ...recipe, hash: '00000000' })
    );
    await userEvent.click(page.getByRole('button', { name: 'Rebuild' }));
    await expect.poll(building, GENERATION).toBe(false);
    await userEvent.click(page.getByRole('button', { name: /rebuilt other walls/ }));

    await expect
      .element(
        page.getByText(/^This generator rebuilt other walls than the recipe saved/),
        GENERATION
      )
      .toBeVisible();
    await expect
      .element(page.getByRole('heading', { name: /· from a recipe · seed 1/ }))
      .toBeVisible();
  });

  test("from the editor, takes the board's size and replaces the board with the maze picked", async () => {
    const replaced: Generated[] = [];
    const used: NewMazeRequest[] = [];
    await render(
      <GenerateDialog
        board={BOARD}
        onOpenChange={() => undefined}
        onReplace={(generated) => replaced.push(generated)}
        onUse={(request) => used.push(request)}
        open
      />
    );

    await expect.element(page.getByRole('radio', { name: '32 × 32' })).toBeChecked();
    await generate();
    await expect
      .element(page.getByRole('button', { name: /^#8,/ }), { timeout: 120_000 })
      .toBeVisible();
    await open(1);
    await expect
      .element(page.getByText('Replaces the maze on the board. Undo brings it back.'))
      .toBeVisible();
    expect(await axeViolations()).toEqual([]);
    await userEvent.click(page.getByRole('button', { name: 'Use this' }));

    expect(used).toEqual([]);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.maze.width).toBe(32);
    expect(replaced[0]?.recipe).toMatchObject({ settings: { size: 32 } });
  }, 150_000);

  test('from the editor of a board it cannot make, says so and opens the maze picked as a new one', async () => {
    await render(
      <GenerateDialog
        board={borderedMaze(8, 8)}
        onOpenChange={() => undefined}
        onReplace={() => undefined}
        onUse={() => undefined}
        open
      />
    );

    await expect
      .element(page.getByText(/^The generator makes 16 × 16 and 32 × 32 mazes, not 8 × 8/))
      .toBeVisible();
    expect(await axeViolations()).toEqual([]);
  });
});

/** Where the gallery starts in the panel's scrolling body, which no run may move. */
function galleryTop(): number | undefined {
  const gallery = document.querySelector('ol[aria-label="Mazes generated"]');
  const body = gallery?.closest('.overflow-y-auto');
  return gallery === null || gallery === undefined || body === null || body === undefined
    ? undefined
    : gallery.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
}

/** Whether a run is on its way, as the status row says. */
function building(): boolean {
  return (document.querySelector('[data-status-row] p')?.textContent ?? '').startsWith('Building');
}

/** The height of the status row above the gallery. */
function statusHeight(): number | undefined {
  return document.querySelector('[data-status-row]')?.getBoundingClientRect().height;
}

/** The recipe Copy recipe puts on the clipboard. */
async function navigatorRecipe(): Promise<string> {
  let copied = '';
  const clipboard = navigator.clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        copied = text;
        return Promise.resolve();
      },
    },
  });
  await userEvent.click(page.getByRole('button', { name: 'Copy recipe' }));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  return copied;
}
