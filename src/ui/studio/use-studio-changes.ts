import { useCallback } from 'react';
import { keyOf, mineIdOf } from '@/library';
import { useStore } from 'zustand';

import type { ChangeRow, ChangesChipProps, ChangesPanelProps } from '@/ui/changes/changes';
import {
  changeDiff,
  changeOf,
  keepChange,
  sessionChanges,
  withoutChange,
  type ChangeItem,
} from '@/ui/changes/session-changes';
import type { Library } from '@/ui/library/use-library';
import { pushRoute } from '@/ui/navigation';

import { useStudio, useStudioStore, type StudioScreen } from './studio-store';

/**
 * The Changes of the session in the studio (PLAN.md 3.4, DESIGN.md 6.2): the rows with each maze
 * as it is now, the one on screen as edited; the diff of the maze on screen against its baseline,
 * shown on the board while "Show on board" is on; Open, Keep and Discard.
 */
export function useStudioChanges({
  screen,
  library,
  phone,
  onDiscard,
}: {
  readonly screen: StudioScreen;
  readonly library: Library | undefined;
  readonly phone: boolean;
  /** Discards an item: deletes a copy or puts back a maze of My mazes, and leaves it if it is open. */
  readonly onDiscard: (item: ChangeItem) => void;
}) {
  const store = useStudioStore();
  const changesOpen = useStudio((state) => state.changesOpen);
  const showDiff = useStudio((state) => state.showDiff);
  const onScreen = screen.kind === 'library' ? undefined : screen.maze;
  const changes = useStore(sessionChanges);
  const rows: ChangeRow[] = changes.items.map((item) => {
    const key = keyOf({ kind: 'mine', id: item.id });
    return { item, current: onScreen?.key === key ? onScreen.maze : library?.mazeOf(key) };
  });
  const screenId = mineIdOf(onScreen?.key);
  const screenItem = screenId === undefined ? undefined : changeOf(changes, screenId);
  const screenDiff =
    screenItem === undefined || onScreen === undefined
      ? undefined
      : changeDiff(screenItem, onScreen.maze);
  const setOpen = useCallback((next: boolean) => store.setState({ changesOpen: next }), [store]);
  const toggleDiff = useCallback(
    () => store.setState((before) => ({ showDiff: !before.showDiff })),
    [store]
  );

  return {
    chip: {
      count: changes.items.length,
      open: changesOpen,
      onToggle: () => setOpen(!changesOpen),
    } satisfies ChangesChipProps,
    panel: {
      open: changesOpen,
      onOpenChange: setOpen,
      rows,
      phone,
      canShowDiff: screenDiff !== undefined,
      showDiff,
      onShowDiff: (next) => store.setState({ showDiff: next }),
      onOpenItem: (item) => {
        setOpen(false);

        if (mineIdOf(onScreen?.key) !== item.id) {
          pushRoute({ kind: 'mine', id: item.id });
        }
      },
      onKeep: (item) => {
        const key = keyOf({ kind: 'mine', id: item.id });
        const shown = onScreen?.key === key ? onScreen : undefined;
        const maze = shown?.maze ?? library?.mazeOf(key);
        const profile = shown?.document.profile ?? library?.documentOf(key)?.profile ?? 'free';
        sessionChanges.setState((before) =>
          maze === undefined
            ? withoutChange(before, item.id)
            : keepChange(before, item.id, { maze, profile })
        );
      },
      onDiscard,
    } satisfies ChangesPanelProps,
    diff: showDiff ? screenDiff : undefined,
    toggleDiff,
    openPanel: () => setOpen(true),
  };
}
