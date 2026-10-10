import { useCallback } from 'react';
import { useStore, type StoreApi } from 'zustand';

import type { MazeDiff } from '@/maze';
import type { ChangeRow, ChangesChipProps, ChangesPanelProps } from '@/ui/changes/changes';
import {
  changeDiff,
  changeOf,
  sessionChanges,
  withoutChange,
  type ChangeItem,
} from '@/ui/changes/session-changes';
import type { Library } from '@/ui/library/use-library';
import { pushRoute } from '@/ui/navigation';
import type { OpenMaze } from '@/ui/open-maze';

import type { StudioState } from './studio-store';

/** What the changes of the studio depend on. */
export interface StudioChangesInput {
  readonly store: StoreApi<StudioState>;
  readonly state: StudioState;
  readonly library: Library | undefined;
  /** The maze on screen, as edited, if any. */
  readonly onScreen: OpenMaze | undefined;
  readonly phone: boolean;
  /** Discards an item: deletes a copy or puts back a maze of Mine, and leaves it if it is open. */
  readonly onDiscard: (item: ChangeItem) => void;
}

/** The chip, the panel, and the diff the board shows. */
export interface StudioChanges {
  readonly chip: ChangesChipProps;
  readonly panel: ChangesPanelProps;
  /** The diff of the maze on screen, while "Show on board" is on. */
  readonly diff: MazeDiff | undefined;
  /** Toggles "Show on board", as `D` does. */
  readonly toggleDiff: () => void;
  readonly openPanel: () => void;
}

function mineId(key: string | undefined): string | undefined {
  return key?.startsWith('mine:') === true ? key.slice('mine:'.length) : undefined;
}

/**
 * The Changes of the session in the studio (PLAN.md 3.4, DESIGN.md 6.2): the rows with each maze
 * as it is now, the one on screen as edited; the diff of the maze on screen against its baseline,
 * shown on the board while "Show on board" is on; Open, Keep and Discard.
 */
export function useStudioChanges({
  store,
  state,
  library,
  onScreen,
  phone,
  onDiscard,
}: StudioChangesInput): StudioChanges {
  const changes = useStore(sessionChanges);
  const rows: ChangeRow[] = changes.items.map((item) => ({
    item,
    current:
      onScreen?.key === `mine:${item.id}` ? onScreen.maze : library?.mazeOf(`mine:${item.id}`),
  }));
  const screenId = mineId(onScreen?.key);
  const screenItem = screenId === undefined ? undefined : changeOf(changes, screenId);
  const screenDiff =
    screenItem === undefined || onScreen === undefined
      ? undefined
      : changeDiff(screenItem, onScreen.maze);
  const setOpen = useCallback((changesOpen: boolean) => store.setState({ changesOpen }), [store]);
  const toggleDiff = useCallback(
    () => store.setState((before) => ({ showDiff: !before.showDiff })),
    [store]
  );

  return {
    chip: {
      count: changes.items.length,
      open: state.changesOpen,
      onToggle: () => setOpen(!state.changesOpen),
    },
    panel: {
      open: state.changesOpen,
      onOpenChange: setOpen,
      rows,
      phone,
      canShowDiff: screenDiff !== undefined,
      showDiff: state.showDiff,
      onShowDiff: (showDiff) => store.setState({ showDiff }),
      onOpenItem: (item) => {
        setOpen(false);

        if (onScreen?.key !== `mine:${item.id}`) {
          pushRoute({ kind: 'mine', id: item.id });
        }
      },
      onKeep: (item) => sessionChanges.setState((before) => withoutChange(before, item.id)),
      onDiscard,
    },
    diff: state.showDiff ? screenDiff : undefined,
    toggleDiff,
    openPanel: () => setOpen(true),
  };
}
