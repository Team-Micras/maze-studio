import { describe, expect, test } from 'vitest';
import { renderHook } from 'vitest-browser-react';

import { createMaze } from '@/maze';
import type { CanvasCamera, Flight } from '@/ui/board/use-canvas-camera';
import type { OpenMaze } from '@/ui/open-maze';
import { createStudioStore } from '@/ui/studio/studio-store';
import { useStudioFlight } from '@/ui/studio/use-studio-flight';

type FlightInput = Parameters<typeof useStudioFlight>[0];

const OPENED: OpenMaze = {
  key: 'repo:classic/x.txt',
  maze: createMaze({ width: 16, height: 16 }),
  name: 'x',
  detail: '',
  document: { trailer: '', profile: 'classic' },
};

/** A camera that records the flights asked of it and never lands or cancels them itself. */
function nothing(): void {}

function recordingCamera(flights: Flight[]): CanvasCamera {
  return {
    camera: { x: 0, y: 0, k: 1 },
    limits: undefined,
    content: { x: 0, y: 0, width: 1, height: 1 },
    element: null,
    attach: nothing,
    set: nothing,
    zoomBy: nothing,
    panBy: nothing,
    centerOn: nothing,
    pinch: nothing,
    refit: nothing,
    fly: (flight) => flights.push(flight),
    jump: nothing,
    wheel: nothing,
  };
}

describe('useStudioFlight', () => {
  test('a flight in that lands after the route has left the maze leaves the library on screen', async () => {
    const store = createStudioStore();
    const flights: Flight[] = [];
    const camera = recordingCamera(flights);
    const input = (opened: OpenMaze | undefined): FlightInput => ({
      store,
      camera,
      shown: [],
      editorInsetsFor: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      opened,
      onScreen: opened,
      phone: false,
      libraryLoaded: true,
    });
    const hook = await renderHook(
      (props?: FlightInput) => useStudioFlight(props ?? input(undefined)),
      { initialProps: input(undefined) }
    );
    await hook.rerender(input(OPENED));
    const flightIn = flights.at(-1);
    await hook.rerender(input(undefined));

    expect(store.getState().mode).toBe('library');
    flightIn?.onLand?.();
    expect(store.getState().mode).toBe('library');
  });
});
