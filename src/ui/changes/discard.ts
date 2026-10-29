import { mineKey } from '@/library';
import type { MazeEditor } from '@/ui/editor/use-maze-editor';
import { reloadLibrary } from '@/ui/library/use-library';
import type { Route } from '@/ui/routes';
import { appStorage } from '@/ui/storage';
import { showToast } from '@/ui/toasts';

import { sessionChanges, withoutChange, type ChangeItem } from './session-changes';

/**
 * Discards `item` of the session's Changes: deletes a copy or a new maze from My mazes, leaving it
 * through `leave` if it is on screen, or saves back the first state of a maze of My mazes from
 * before, with the generator's recipe it had or none, and shows that state. A save refused
 * because another tab saved since keeps the item and says so.
 *
 * @param leave Leaves the maze on screen for where the copy came from, if anywhere.
 */
export async function discardChange(
  item: ChangeItem,
  editor: Pick<MazeEditor, 'shown' | 'savedVersion' | 'reopen'>,
  leave: (source: Route | undefined) => void
): Promise<void> {
  const shown = editor.shown;
  const open = shown?.key === mineKey(item.id);
  const mine = (await appStorage())?.mine;

  if (item.kind !== 'existing') {
    sessionChanges.setState((before) => withoutChange(before, item.id));

    if (open) {
      leave(item.source);
    }

    await mine?.remove(item.id);
    reloadLibrary();
    return;
  }

  const stored = await mine?.get(item.id);
  const saved =
    mine === undefined || stored === undefined || item.baseline === undefined
      ? undefined
      : await mine.save(
          item.id,
          {
            maze: item.baseline,
            profile: item.baselineProfile,
            recipe: item.baselineRecipe ?? null,
          },
          editor.savedVersion(item.id) ?? stored.version
        );

  if (saved?.ok !== true) {
    showToast(`Could not discard ${item.name} (changed in another tab)`, { verbatim: item.name });
    return;
  }

  sessionChanges.setState((before) => withoutChange(before, item.id));
  reloadLibrary();

  if (open && shown !== undefined) {
    editor.reopen({
      ...shown,
      maze: item.baseline ?? shown.maze,
      document: {
        ...shown.document,
        profile: item.baselineProfile ?? shown.document.profile,
        mine: { id: item.id, version: saved.value.version },
        recipe: item.baselineRecipe,
      },
    });
  }
}
