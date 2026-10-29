import { useStore, type StoreApi } from 'zustand';

import type { RenameDialogProps } from '@/ui/editor/rename-dialog';
import {
  copyText,
  downloadName,
  downloadText,
  linkDropsNotes,
  mazeFileText,
  mazeLink,
} from '@/ui/editor/share';
import type { MazeEditor } from '@/ui/editor/use-maze-editor';
import { replaceRoute } from '@/ui/navigation';
import { showToast } from '@/ui/toasts';
import { encodeMazeCode } from '@/maze';

import type { StudioScreen, StudioState } from './studio-store';

const COPY_FAILED = 'Copy failed, link is in the address bar';

const NOTES_LEFT_OUT = 'Notes after the grid are not in the link';

function canShare(): boolean {
  return typeof navigator.share === 'function';
}

/**
 * The actions on the open maze (PLAN.md 3.4, DESIGN.md 6.1 and 12): Copy link, which says when
 * the notes after the grid stay out of the link and, without a clipboard, puts the link in the
 * address bar; Share… with Web Share; Download .txt under a stem that passes the name rule; Save
 * to My mazes and Save to folder; Rename and Delete for a maze of My mazes; Copy recipe for a
 * generated maze.
 */
export function useMazeActions({
  store,
  screen,
  editor,
  phone,
  onSaveToFolder,
  onDelete,
  mineNames,
}: {
  readonly store: StoreApi<StudioState>;
  readonly screen: StudioScreen;
  readonly editor: MazeEditor;
  readonly phone: boolean;
  /** Writes `text` over the folder's `fileName`. */
  readonly onSaveToFolder: (fileName: string, text: string) => void;
  /** Deletes the mazes of My mazes `ids` and opens the library on My mazes. */
  readonly onDelete: (ids: readonly string[]) => void;
  /** Every name in My mazes, with this maze's own. */
  readonly mineNames: readonly string[];
}) {
  const renameOpen = useStore(store, (state) => state.renameOpen);
  const viewing = useStore(store, (state) => state.viewing);
  const open = screen.kind === 'editing' ? screen.maze : undefined;
  const mineId = open?.document.mine?.id;

  const copyLink = (): void => {
    if (open === undefined) {
      return;
    }

    void copyText(mazeLink(open, window.location.href)).then((copied) => {
      if (!copied) {
        showToast(COPY_FAILED);
        replaceRoute({ kind: 'link', code: encodeMazeCode(open.maze, { name: open.name }) });
      } else {
        showToast(linkDropsNotes(open) ? NOTES_LEFT_OUT : 'Link copied');
      }
    });
  };

  const { folderFile } = editor;

  const rename: RenameDialogProps | undefined =
    open === undefined || (mineId === undefined && open.document.created !== true)
      ? undefined
      : {
          open: renameOpen,
          onOpenChange: (next) => store.setState({ renameOpen: next }),
          name: open.name,
          taken: mineNames.filter((name) => name.toLowerCase() !== open.name.toLowerCase()),
          onRename:
            mineId === undefined
              ? (name) => {
                  editor.reopen({ ...open, name });
                  return Promise.resolve(true);
                }
              : async (name) => {
                  const done = await editor.rename(name);

                  if (!done) {
                    showToast(
                      `Could not rename ${open.name} (changed in another tab). Reload to rename`,
                      {
                        verbatim: open.name,
                      }
                    );
                  }

                  return done;
                },
        };

  return {
    menu: {
      onSaveToMine: editor.canSaveToMine && (viewing || !phone) ? editor.saveToMine : undefined,
      onDownload: () => {
        if (open !== undefined) {
          downloadText(downloadName(open), mazeFileText(open));
        }
      },
      onCopyLink: phone ? copyLink : undefined,
      onCopyRecipe:
        open?.document.recipe === undefined
          ? undefined
          : () => {
              void copyText(JSON.stringify(open.document.recipe)).then((copied) =>
                showToast(copied ? 'Recipe copied' : 'Copy failed')
              );
            },
      ...(phone && canShare() && open !== undefined
        ? {
            onShare: () => {
              void navigator
                .share({ title: open.name, url: mazeLink(open, window.location.href) })
                .catch(() => undefined);
            },
          }
        : {}),
      ...(mineId === undefined
        ? {}
        : {
            onRename: () => store.setState({ renameOpen: true }),
            onDelete: () => onDelete([mineId]),
          }),
    },
    title:
      folderFile === undefined || open === undefined
        ? {}
        : { folderFile, onSaveToFolder: () => onSaveToFolder(folderFile, mazeFileText(open)) },
    copyLink: phone ? undefined : { onCopy: copyLink },
    rename,
  };
}
