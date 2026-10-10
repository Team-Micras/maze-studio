import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { createMaze, validateMaze, type Finding, type Profile } from '@/maze';
import { Checks } from '@/ui/editor/checks';
import { checksSummary } from '@/ui/editor/checks-summary';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';

interface Heard {
  readonly profiles: Profile[];
  readonly selected: (string | undefined)[];
}

const OPEN_BORDER = validateMaze({ maze: createMaze({ width: 4, height: 4 }), profile: 'free' });

function chipExpanded(): string | null | undefined {
  return document.querySelector('[data-checks]')?.getAttribute('aria-expanded');
}

async function mount(findings: readonly Finding[], phone = false): Promise<Heard> {
  const heard: Heard = { profiles: [], selected: [] };
  await render(
    <TooltipProvider>
      <main>
        <div className="size-40" id="canvas" tabIndex={-1}>
          Canvas
        </div>
        <Checks
          findings={findings}
          onProfile={(profile) => heard.profiles.push(profile)}
          onSelect={(_, key) => heard.selected.push(key)}
          phone={phone}
          profile="free"
          selected={undefined}
        />
      </main>
    </TooltipProvider>
  );
  return heard;
}

describe('The checks', () => {
  test('say the warnings on the chip, and list them in the panel', async () => {
    await mount(OPEN_BORDER);
    const chip = page.getByRole('button', { name: /^Checks: \d+ warnings?$/ });
    await userEvent.click(chip);

    await expect.element(page.getByRole('dialog', { name: 'Checks' })).toBeVisible();
    expect(document.querySelectorAll('[data-finding]').length).toBe(OPEN_BORDER.length);
    expect(await axeViolations()).toEqual([]);
  });

  test('show the count on a phone, and say the checks beside the chip', async () => {
    await mount(OPEN_BORDER, true);
    const chip = document.querySelector('[data-checks]');
    const region = document.querySelector('[aria-live="polite"]');

    expect(chip?.textContent).toBe(String(checksSummary(OPEN_BORDER).count));
    expect(region?.textContent).toMatch(/^Checks: \d+ warnings?$/);
    expect(chip?.contains(region ?? null)).toBe(false);
  });

  test('pass with nothing to say, under the rules chosen', async () => {
    await mount([]);
    await userEvent.click(page.getByRole('button', { name: 'Checks: Passes' }));

    await expect.element(page.getByText('Every check passes for the free rules.')).toBeVisible();
  });

  test('show a finding clicked, change the rules, and stay open while the canvas is used', async () => {
    const heard = await mount(OPEN_BORDER);
    await userEvent.click(page.getByRole('button', { name: /^Checks/ }));
    await userEvent.click(page.getByRole('button', { name: OPEN_BORDER[0]?.message ?? '' }));
    await userEvent.click(page.getByRole('radio', { name: 'Training' }));
    await userEvent.click(page.getByRole('radio', { name: 'Free' }));
    await userEvent.click(page.getByText('Canvas'));

    expect(heard.selected).toEqual(['closed-border#0']);
    expect(heard.profiles).toEqual(['training']);
    expect(chipExpanded()).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(chipExpanded()).toBe('false');
    await expect.element(page.getByRole('dialog', { name: 'Checks' })).not.toBeInTheDocument();
  });

  test('open as a sheet on a phone, which a finding clicked closes', async () => {
    const heard = await mount(OPEN_BORDER, true);
    await userEvent.click(page.getByRole('button', { name: /^Checks/ }));

    await expect.element(page.getByRole('dialog', { name: 'Checks' })).toBeVisible();
    expect(await axeViolations()).toEqual([]);
    await userEvent.click(page.getByRole('button', { name: OPEN_BORDER[0]?.message ?? '' }));
    await expect.element(page.getByRole('dialog', { name: 'Checks' })).not.toBeInTheDocument();
    expect(heard.selected).toEqual(['closed-border#0']);
  });
});
