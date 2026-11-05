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

import {
  explore,
  type Exploration,
  type Maze,
  type RouteSwitches,
  type ShortestRoutes,
} from '@/maze';

/** Both routes off, as the session starts. */
export const NO_ROUTES: RouteSwitches = { withoutDiagonals: false, withDiagonals: false };

interface ShownRoutes {
  readonly shown: RouteSwitches;
  /** Whether the flood-fill search is drawn on the boards. */
  readonly exploration: boolean;
}

/** The session's route switches. */
export const useShownRoutes = create<ShownRoutes>()(() => ({
  shown: NO_ROUTES,
  exploration: false,
}));

/** Whether `shown` draws any route. */
export function anyRouteShown(shown: RouteSwitches | undefined): boolean {
  return shown !== undefined && (shown.withoutDiagonals || shown.withDiagonals);
}

/** Flips the switch of the route `name`. */
export function toggleRoute(name: keyof ShortestRoutes): void {
  useShownRoutes.setState(({ shown }) => ({ shown: { ...shown, [name]: !shown[name] } }));
}

/** Flips the switch of the flood-fill search; turning it off stops its playback. */
export function toggleExploration(): void {
  if (useShownRoutes.getState().exploration) {
    stopExploration();
  }

  useShownRoutes.setState(({ exploration }) => ({ exploration: !exploration }));
}

/** The search of `maze` when `on`, which searches nothing when off, and when it has none. */
export function explorationShown(maze: Maze, on: boolean): Exploration | undefined {
  return on ? (explore(maze) ?? undefined) : undefined;
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
  useShownRoutes.setState({ exploration: true });

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
