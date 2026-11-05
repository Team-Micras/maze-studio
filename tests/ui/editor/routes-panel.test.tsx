import type { ReactNode } from 'react';
import { useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render as renderReact } from 'vitest-browser-react';

import { explore, presetMaze, shortestRoutes, type ShortestRoutes } from '@/maze';
import { Routes } from '@/ui/editor/routes-panel';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import {
  NO_ROUTES,
  stopExploration,
  useExplorationPlayback,
  useShownRoutes,
} from '@/ui/route-switches';
import '@/ui/styles.css';
import { axeViolations } from '@tests/support/axe-check';

const render = (ui: ReactNode) => renderReact(ui, { wrapper: TooltipProvider });

interface Heard {
  readonly toggled: (keyof ShortestRoutes)[];
}

const CLASSIC = shortestRoutes(presetMaze('classic'));
const SEARCH = explore(presetMaze('classic'))!;

afterEach(() => {
  stopExploration();
  useShownRoutes.setState({ shown: NO_ROUTES, exploration: false });
});

function Harness({
  routes,
  phone,
  heard,
}: {
  readonly routes: ShortestRoutes | null | undefined;
  readonly phone: boolean;
  readonly heard: Heard;
}) {
  const [open, setOpen] = useState(phone);
  return (
    <main>
      <Routes
        cellSize={0.18}
        exploration={SEARCH}
        onOpenChange={setOpen}
        onToggle={(name) => heard.toggled.push(name)}
        open={open}
        phone={phone}
        routes={routes}
        shown={{ withoutDiagonals: true, withDiagonals: false }}
      />
    </main>
  );
}

/** Mounts the panel, opened from its button on a notebook and already open on a phone. */
async function mount(routes: ShortestRoutes | null | undefined, phone = false): Promise<Heard> {
  const heard: Heard = { toggled: [] };
  await render(<Harness heard={heard} phone={phone} routes={routes} />);

  if (!phone) {
    await userEvent.click(page.getByRole('button', { name: 'Routes' }));
  }

  return heard;
}

describe('The Routes panel', () => {
  test.each([false, true])(
    'lists both routes with their cells and metres, phone %s',
    async (phone) => {
      await mount(CLASSIC, phone);
      const { withoutDiagonals, withDiagonals } = CLASSIC!;

      await expect.element(page.getByRole('dialog', { name: 'Routes' })).toBeVisible();
      await expect
        .element(
          page.getByText(
            `${withoutDiagonals.cells} cells · ${(withoutDiagonals.length * 0.18).toFixed(2)} m`
          )
        )
        .toBeVisible();
      await expect
        .element(
          page.getByText(
            `${withDiagonals.cells} cells · ${(withDiagonals.length * 0.18).toFixed(2)} m`
          )
        )
        .toBeVisible();
      expect(await axeViolations()).toEqual([]);
    }
  );

  test('switches a route by its row or its switch', async () => {
    const heard = await mount(CLASSIC);
    const without = page.getByRole('switch', { name: /^Without diagonals/ });
    const withDiagonals = page.getByRole('switch', { name: /^With diagonals/ });

    await expect.element(without).toBeChecked();
    await expect.element(withDiagonals).not.toBeChecked();
    await userEvent.click(page.getByText('With diagonals'));
    await userEvent.click(without);

    expect(heard.toggled).toEqual(['withDiagonals', 'withoutDiagonals']);
  });

  test('lists the flood-fill search with its moves, cells and walls seen, off', async () => {
    await mount(CLASSIC);

    await expect
      .element(page.getByRole('switch', { name: /^Flood fill · to the goal/ }))
      .not.toBeChecked();
    await expect
      .element(
        page.getByText(
          `${SEARCH.moves} moves · ${SEARCH.cells} cells · ${Math.round(SEARCH.seen * 100)}% of walls seen`
        )
      )
      .toBeVisible();
  });

  test('plays the search with ▶, turning its switch on, and pauses and resumes it', async () => {
    await mount(CLASSIC);
    await userEvent.click(page.getByRole('button', { name: 'Play the search' }));

    await expect.element(page.getByRole('switch', { name: /^Flood fill/ })).toBeChecked();
    expect(useExplorationPlayback.getState()).toMatchObject({ exploration: SEARCH, playing: true });
    await userEvent.click(page.getByRole('button', { name: 'Pause the search' }));
    expect(useExplorationPlayback.getState()?.playing).toBe(false);
    await expect.element(page.getByRole('button', { name: 'Play the search' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Play the search' }));
    expect(useExplorationPlayback.getState()?.playing).toBe(true);
    await userEvent.click(page.getByRole('switch', { name: /^Flood fill/ }));
    expect(useExplorationPlayback.getState()).toBeUndefined();
  });

  test('closes its sheet on a phone once ▶ starts the search, so it plays over the whole board', async () => {
    await mount(CLASSIC, true);
    await userEvent.click(page.getByRole('button', { name: 'Play the search' }));

    expect(useExplorationPlayback.getState()?.playing).toBe(true);
    await expect.element(page.getByRole('dialog', { name: 'Routes' })).not.toBeInTheDocument();
  });

  test('asks for a start and a goal when the maze has none', async () => {
    await mount(undefined);

    await expect.element(page.getByText(/^Routes need a start and a goal/)).toBeVisible();
    expect(document.querySelector('[role="switch"]')).toBeNull();
  });

  test('says so when the goal is out of reach', async () => {
    await mount(null);

    await expect.element(page.getByText(/^The goal can't be reached/)).toBeVisible();
  });
});
