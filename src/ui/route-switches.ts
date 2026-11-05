/**
 * Which shortest routes and whether the flood-fill search the app draws (DESIGN.md 6), one choice
 * for the session that the editor's board and Routes panel, the generator's gallery and maze, and
 * the library's thumbnails share. All start off; each switch turns its drawing on or off
 * everywhere, and opening a Routes panel changes nothing.
 *
 * The editor's ▶ plays the search on its board: {@link useExplorationPlayback} holds how far.
 *
 * @module
 */

import { create } from 'zustand';

import { explore, shortestRoutes, type Exploration, type Maze } from '@/maze';
import type { RouteOverlays } from '@/render';

/** Whether each shortest route and the flood-fill search are drawn. */
export type OverlaySwitches = Readonly<
  Record<'withoutDiagonals' | 'withDiagonals' | 'exploration', boolean>
>;

/** Every switch off, as the session starts. */
export const NO_OVERLAYS: OverlaySwitches = {
  withoutDiagonals: false,
  withDiagonals: false,
  exploration: false,
};

/** The session's switches. */
export const useOverlaySwitches = create<OverlaySwitches>()(() => NO_OVERLAYS);

/** Whether `switches` draw anything. */
export function anyOverlayShown(switches: OverlaySwitches): boolean {
  return switches.withoutDiagonals || switches.withDiagonals || switches.exploration;
}

/** Flips the switch `name`; turning the search's off stops its playback. */
export function toggleOverlay(name: keyof OverlaySwitches): void {
  if (name === 'exploration' && useOverlaySwitches.getState().exploration) {
    stopExploration();
  }

  useOverlaySwitches.setState((switches) => ({ [name]: !switches[name] }));
}

/**
 * The routes and the search of `maze` that `switches` turn on; a search whose switch is off is
 * never run, and what the maze has none of is left out.
 */
export function shownOverlays(maze: Maze, switches: OverlaySwitches): RouteOverlays {
  const routes =
    switches.withoutDiagonals || switches.withDiagonals
      ? (shortestRoutes(maze) ?? undefined)
      : undefined;
  return {
    routes: routes && {
      withoutDiagonals: switches.withoutDiagonals ? routes.withoutDiagonals : undefined,
      withDiagonals: switches.withDiagonals ? routes.withDiagonals : undefined,
    },
    exploration: switches.exploration ? (explore(maze) ?? undefined) : undefined,
  };
}

/** The search being played and how far, in moves from the start. */
export interface ExplorationPlayback {
  readonly exploration: Exploration;
  readonly at: number;
  readonly playing: boolean;
}

/** The playback of the editor's ▶, `undefined` while none plays or pauses. */
export const useExplorationPlayback = create<ExplorationPlayback | undefined>()(() => undefined);

const PACE = 8;
const LONGEST = 20;

let frame = 0;
let last = 0;

function tick(time: number): void {
  const now = useExplorationPlayback.getState();

  if (now === undefined || !now.playing) {
    return;
  }

  const { moves } = now.exploration;
  const at = now.at + (Math.max(0, time - last) / 1000) * Math.max(PACE, moves / LONGEST);
  last = time;

  if (at >= moves) {
    useExplorationPlayback.setState(undefined, true);
    return;
  }

  useExplorationPlayback.setState({ ...now, at }, true);
  frame = requestAnimationFrame(tick);
}

/**
 * Plays `exploration` from the start, about 8 moves a second and never longer than 20 s, or
 * pauses or resumes it if it is the one being played; it turns the search's switch on.
 */
export function playExploration(exploration: Exploration): void {
  const now = useExplorationPlayback.getState();
  cancelAnimationFrame(frame);
  useOverlaySwitches.setState({ exploration: true });

  if (now?.exploration === exploration && now.playing) {
    useExplorationPlayback.setState({ ...now, playing: false }, true);
    return;
  }

  useExplorationPlayback.setState(
    { exploration, at: now?.exploration === exploration ? now.at : 0, playing: true },
    true
  );
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

/** Stops the playback, so that the board draws the whole trail still. */
export function stopExploration(): void {
  cancelAnimationFrame(frame);
  useExplorationPlayback.setState(undefined, true);
}

/** Stops the playback unless it plays `exploration`, as when the maze on the board changes. */
export function stopExplorationUnless(exploration: Exploration | undefined): void {
  const now = useExplorationPlayback.getState();

  if (now !== undefined && now.exploration !== exploration) {
    stopExploration();
  }
}
