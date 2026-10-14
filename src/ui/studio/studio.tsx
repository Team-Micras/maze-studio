import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { filterCatalog, type LibraryFilter } from '@/library';
import {
  boardLimits,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_PHONE_EDIT_INSETS,
  EDITOR_PHONE_INSETS,
  EDITOR_ZOOM,
  type CameraLimits,
  type Insets,
  type ViewportSize,
  type WorldRect,
} from '@/render';
import { CameraStage } from '@/ui/board/camera-stage';
import { useCanvasCamera } from '@/ui/board/use-canvas-camera';
import { CANVAS_ID } from '@/ui/canvas-id';
import { ChangesChip, ChangesPanel } from '@/ui/changes/changes';
import { changeOf, sessionChanges, type ChangeItem } from '@/ui/changes/session-changes';
import { Checks } from '@/ui/editor/checks';
import { EditControls } from '@/ui/editor/edit-controls';
import { MoreActions } from '@/ui/editor/more-actions';
import { typingIn } from '@/ui/typing-in';
import { RenameDialog } from '@/ui/editor/rename-dialog';
import { ShortcutHelp } from '@/ui/editor/shortcut-help';
import { CopyLinkButton, TitleActions } from '@/ui/editor/title-actions';
import type { MazeEditor } from '@/ui/editor/use-maze-editor';
import { useWriting } from '@/ui/editor/use-writing';
import { useCoarsePointer, usePhoneLayout } from '@/ui/hooks/use-media-query';
import { EmptyLibrary } from '@/ui/library/empty-library';
import type { MineAndFilesActions } from '@/ui/library/mine-and-files';
import { LibraryGrid } from '@/ui/library/library-grid';
import { libraryScroller } from '@/ui/library/library-scroller';
import { LibraryChrome } from '@/ui/library/library-chrome';
import type { Library } from '@/ui/library/use-library';
import { openEntry, type OpenMaze } from '@/ui/open-maze';
import { cn } from '@/ui/primitives/utils';
import { useTheme } from '@/ui/theme';
import { newMazeName, type NewMazeRequest } from '@/ui/new-maze';
import { routeOfEntry, type Route } from '@/ui/routes';

import { EditorChrome } from './editor-chrome';
import { listOrder, steppedKey } from './list-order';
import { MazeList } from './maze-list';
import { OpenBoard } from './open-board';
import { useMazeActions } from './use-maze-actions';
import { useStudioChanges } from './use-studio-changes';
import { useStudioEditing } from './use-studio-editing';
import { useStudioFlight } from './use-studio-flight';
import { boardOf, createStudioStore, type StudioState } from './studio-store';

/** The props of {@link Studio}. */
export interface StudioProps {
  /** The library, or `undefined` while it loads. */
  readonly library: Library | undefined;
  /** The maze the route or an opened file puts on screen, if any, as edited. */
  readonly opened: OpenMaze | undefined;
  /** The editing of the maze on screen. */
  readonly editor: MazeEditor;
  /** The filter of the library, the last one shown. */
  readonly filter: LibraryFilter;
  readonly onFilter: (filter: LibraryFilter) => void;
  readonly onOpenFile: (file: File) => void;
  /** Opens a new maze in the editor. */
  readonly onNew: (request: NewMazeRequest) => void;
  /** The names in My mazes, which a new or renamed maze must not take. */
  readonly mineNames: readonly string[];
  /** Discards an item of Changes: deletes a copy or puts back a maze of My mazes. */
  readonly onDiscard: (item: ChangeItem) => void;
  /** Writes `text` over the opened folder's `fileName`. */
  readonly onSaveToFolder: (fileName: string, text: string) => void;
  /** Deletes the maze of My mazes `id` and opens the library on My mazes. */
  readonly onDelete: (id: string) => void;
  /** What the library's "My mazes and files" menu does. */
  readonly files: MineAndFilesActions;
  /** What the credit adds of the updates from GitHub, if anything. */
  readonly updateNote?: string | undefined;
  /** Leaves the open maze for the library. */
  readonly onLibrary: () => void;
  /** Puts the maze of a catalog entry in the route, in place of the open one. */
  readonly onPin: (route: Route) => void;
}

/**
 * The editor's insets (DESIGN.md 7): on a phone, 84 px under the board for the tools in edit mode
 * and 88 px for the Edit button in view mode.
 */
function editorInsetsFor(phone: boolean, viewing: boolean): Insets {
  if (!phone) {
    return EDITOR_INSETS;
  }

  return viewing ? EDITOR_PHONE_INSETS : EDITOR_PHONE_EDIT_INSETS;
}

/** Where the content is while no board is on the stage, as in the library. */
const NO_BOARD: WorldRect = { x: 0, y: 0, width: 1, height: 1 };

/** The camera's limits while no board is on the stage: it stays where it is. */
function stillLimits(viewport: ViewportSize): CameraLimits {
  const fit = { x: 0, y: 0, k: 1 };
  return { viewport, fit, zoom: { min: 1, max: 1 }, place: () => fit };
}

/**
 * The library and the open maze (PLAN.md 3.4, DESIGN.md 8): the library a grid the browser
 * scrolls, the maze a board on a canvas above it. Opening an artboard flies its board from the
 * thumbnail to the editor's fit in 620 ms while its full board cross-fades over the thumbnail and
 * the grid fades out; leaving flies back in 520 ms and lands on the artboard of the maze on
 * screen. A maze opened by its route on a fresh load, from a link or from a file, or with reduced
 * motion, arrives without a flight. The quick list previews mazes in place, on the same board. An
 * open maze is edited in place (PLAN.md 3.4): the wall tool draws, the arrows move a cell cursor,
 * and a phone, or a maze opened by touch, opens to look at until Edit.
 */
export function Studio({
  library,
  opened,
  editor,
  filter,
  onFilter,
  onOpenFile,
  onNew,
  mineNames,
  onDiscard,
  onSaveToFolder,
  onDelete,
  files,
  updateNote,
  onLibrary,
  onPin,
}: StudioProps) {
  const [store] = useState(createStudioStore);
  const state: StudioState = useStore(store);
  const phone = usePhoneLayout();
  const editorInsets = editorInsetsFor(phone, state.viewing);
  const shown = library === undefined ? [] : filterCatalog(library.entries, filter, library.index);
  const { mode } = state;
  const newName = newMazeName('', mineNames);
  const mineIsEmpty = filter.source === 'mine' && library?.mineCount === 0;
  const emptyTitle =
    library !== undefined && mode === 'library' && shown.length === 0
      ? mineIsEmpty
        ? 'Nothing in My mazes yet'
        : 'No mazes match'
      : undefined;

  const previewEntry =
    state.preview !== undefined && state.preview !== opened?.key
      ? library?.entries.find((entry) => entry.key === state.preview)
      : undefined;
  const previewed =
    previewEntry === undefined || library === undefined
      ? undefined
      : openEntry(previewEntry, library);
  const onScreen = previewed ?? opened ?? state.leaving;
  const board = onScreen === undefined ? undefined : boardOf(onScreen.maze);
  const inEditor = mode === 'editor' && board !== undefined;

  const camera = useCanvasCamera({
    content: board ?? NO_BOARD,
    limits: (viewport) =>
      board === undefined
        ? stillLimits(viewport)
        : boardLimits({
            board,
            viewport,
            insets: editorInsets,
            zoom: EDITOR_ZOOM,
            keep: EDITOR_KEEP,
          }),
  });
  const coarse = useCoarsePointer();
  const writing = useWriting();
  const sessionChangesNow = useStore(sessionChanges);
  const theme = useTheme((current) => current.theme);
  const toggleTheme = useTheme((current) => current.toggle);
  const changes = useStudioChanges({ store, state, library, onScreen, phone, onDiscard });
  const actions = useMazeActions({
    store,
    state,
    editor,
    open: mode === 'editor' && previewed === undefined ? onScreen : undefined,
    phone,
    onSaveToFolder,
    onDelete,
    mineNames,
  });
  const editing = useStudioEditing({
    store,
    state,
    editor,
    camera,
    onScreen,
    previewing: previewed !== undefined,
    board,
    insets: editorInsets,
    phone,
    coarse,
    diff: mode === 'editor' ? changes.diff : undefined,
    onToggleDiff: changes.toggleDiff,
    onChanges: changes.openPanel,
  });

  const onScreenKey = useRef(onScreen?.key);
  const listOpener = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    onScreenKey.current = onScreen?.key;
  });

  const openList = useCallback(() => {
    listOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    store.setState({ listOpen: true, preview: undefined });
  }, [store]);

  const closeList = (): void => {
    (listOpener.current ?? camera.element)?.focus({ preventScroll: true });
    listOpener.current = null;
  };

  const preparedMaze =
    mode === 'library' && state.prepared !== undefined
      ? library?.mazeOf(state.prepared)
      : undefined;

  const { notePointer } = useStudioFlight({
    store,
    camera,
    shown,
    editorInsetsFor: (viewing: boolean) => editorInsetsFor(phone, viewing),
    opened,
    onScreen,
    phone,
    mode,
    libraryLoaded: library !== undefined,
  });

  const pinKey = (key: string): void => {
    const entry = library?.entries.find((candidate) => candidate.key === key);
    store.setState({ listOpen: false });

    if (entry !== undefined) {
      onPin(routeOfEntry(entry));
    }

    store.setState({ preview: undefined });
  };

  useEffect(() => {
    if (mode !== 'editor' || library === undefined) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || typingIn(event.target)) {
        return;
      }

      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        openList();
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const keys = listOrder(library.entries).map((entry) => entry.key);
        const next = steppedKey(keys, onScreenKey.current, event.key === ']' ? 1 : -1);
        const entry = library.entries.find((candidate) => candidate.key === next);

        if (entry !== undefined) {
          onPin(routeOfEntry(entry));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, library, onPin, openList]);

  const libraryVisible = mode === 'library' || mode === 'flying-out';
  const flying = mode === 'flying-in' || mode === 'flying-out';
  const chromeMounted = useDeferredValue(mode !== 'library', false);
  const editorVisible = mode === 'editor' || (mode === 'flying-in' && state.chromeIn);
  const primaryPan = mode === 'editor' && (state.viewing || state.tool === 'hand') ? 'on' : 'off';
  const { refit } = camera;
  const changeFilter = useCallback(
    (next: LibraryFilter): void => {
      onFilter(next);
      libraryScroller()?.scrollTo({ top: 0, behavior: 'instant' });
    },
    [onFilter]
  );

  return (
    <div data-studio-mode={mode} data-viewing={mode === 'editor' && state.viewing ? '' : undefined}>
      <main>
        {library === undefined ? null : (
          <LibraryGrid
            entries={shown}
            hidden={!libraryVisible}
            library={library}
            onArtboardPointer={(pointerType, key) => {
              notePointer(pointerType);

              if (mode === 'library' && key !== state.prepared) {
                store.setState({ prepared: key });
              }
            }}
            phone={phone}
          />
        )}
        <CameraStage
          className={cn(
            'fixed inset-0 z-[1]',
            mode === 'library' && 'pointer-events-none invisible',
            mode === 'flying-out' && 'pointer-events-none',
            editing.drawingTool && 'cursor-crosshair',
            mode === 'editor' && !state.viewing && state.tool === 'hand' && 'cursor-grab'
          )}
          controller={camera}
          drawing={editing.drawing}
          id={CANVAS_ID}
          label={inEditor && onScreen !== undefined ? `${onScreen.name}, maze board` : 'Maze board'}
          onKeyDown={editing.onCanvasKey}
          primaryPan={primaryPan}
          promoted={flying}
        >
          {mode !== 'library' && onScreen !== undefined && board !== undefined ? (
            <OpenBoard
              maze={onScreen.maze}
              overlays={mode === 'editor' ? editing.overlays : undefined}
              fadeIn={mode !== 'flying-out'}
              rect={board}
              shown
            />
          ) : preparedMaze === undefined ? null : (
            <OpenBoard maze={preparedMaze} rect={boardOf(preparedMaze)} shown={false} />
          )}
        </CameraStage>
        {emptyTitle === undefined ? null : (
          <EmptyLibrary
            mineIsEmpty={mineIsEmpty}
            newName={newName}
            onNew={onNew}
            title={emptyTitle}
          />
        )}
        <p aria-live="polite" className="sr-only">
          {emptyTitle ?? ''}
        </p>
      </main>
      <LibraryChrome
        filter={filter}
        library={library}
        onFilter={changeFilter}
        changes={libraryVisible ? <ChangesChip {...changes.chip} /> : null}
        newName={newName}
        onNew={onNew}
        onOpenFile={onOpenFile}
        files={files}
        updateNote={updateNote}
        phone={phone}
        visible={libraryVisible}
      />
      {chromeMounted && onScreen !== undefined && board !== undefined && mode !== 'library' ? (
        <EditorChrome
          board={board}
          controller={camera}
          actions={
            editing.checks === undefined ? null : (
              <>
                <ChangesChip {...changes.chip} />
                <Checks {...editing.checks} />
                <MoreActions
                  {...editing.actions}
                  {...actions.menu}
                  onFit={() => refit({ animate: true })}
                  onToggleTheme={toggleTheme}
                  theme={theme}
                />
                {actions.copyLink === undefined ? null : <CopyLinkButton {...actions.copyLink} />}
              </>
            )
          }
          cursor={editing.cursor}
          titleActions={<TitleActions {...actions.title} />}
          rename={
            actions.rename === undefined || previewed !== undefined
              ? undefined
              : { taken: actions.rename.taken, onRename: actions.rename.onRename }
          }
          landed={mode === 'editor'}
          listOpen={state.listOpen}
          onLibrary={onLibrary}
          onToggleList={() => {
            if (state.listOpen) {
              store.setState({ listOpen: false, preview: undefined });
              closeList();
            } else {
              openList();
            }
          }}
          open={onScreen}
          phone={phone}
          visible={editorVisible}
        >
          <EditControls {...editing.controls} />
        </EditorChrome>
      ) : null}
      {mode === 'editor' && !coarse ? <ShortcutHelp {...editing.help} /> : null}
      {actions.rename === undefined ? null : <RenameDialog {...actions.rename} />}
      {mode === 'library' || mode === 'editor' ? <ChangesPanel {...changes.panel} /> : null}
      {state.listOpen && library !== undefined && mode === 'editor' ? (
        <MazeList
          current={onScreen?.key}
          library={library}
          onCancel={() => {
            store.setState({ listOpen: false, preview: undefined });
            closeList();
          }}
          onPin={(key) => {
            pinKey(key);
            closeList();
          }}
          onPreview={(key) => store.setState({ preview: key })}
          phone={phone}
          saveState={
            writing
              ? { kind: 'saving' }
              : opened?.document.mine === undefined ||
                  changeOf(sessionChangesNow, opened.document.mine.id) === undefined
                ? undefined
                : { kind: 'saved', name: opened.name }
          }
        />
      ) : null}
    </div>
  );
}
