import { useStore, type StoreApi } from 'zustand';
import { useCallback, type FocusEvent, type KeyboardEvent } from 'react';

import { fillBorder, validateMaze, type Finding, type MazeDiff } from '@/maze';
import { areaInWorld, boardGeometry, focusArea, revealCamera, type Insets } from '@/render';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import type { ChecksProps } from '@/ui/editor/checks';
import { findingKey } from '@/ui/editor/checks-summary';
import type { ShortcutHelpProps } from '@/ui/editor/shortcut-help';
import { toolInfo, type Tool } from '@/ui/editor/tools';
import { useBoardKeys, type BoardKey } from '@/ui/editor/use-board-keys';
import { isCellTool, useCellDrawing } from '@/ui/editor/use-cell-drawing';
import { useEditorShortcuts, type EditorShortcuts } from '@/ui/editor/use-editor-shortcuts';
import type { MazeEditor } from '@/ui/editor/use-maze-editor';
import { useWallDrawing } from '@/ui/editor/use-wall-drawing';

import type { StudioScreen, StudioState } from './studio-store';

const EDIT_HINT = 'Tap a slot to toggle. Drag to draw. Two fingers pan';

/**
 * Editing the maze on screen in the studio (PLAN.md 3.4): the tool that draws with the pointer, the
 * keyboard cursor, the shortcuts, the checks with the finding shown on the board, and the editor's
 * menu and help. Nothing edits while the maze is only looked at, previewed from the quick list, or
 * held by a newer version in another tab.
 */
export function useStudioEditing({
  store,
  screen,
  editor,
  camera,
  insets,
  phone,
  coarse,
  diff,
  onToggleDiff,
  onChanges,
  list,
}: {
  readonly store: StoreApi<StudioState>;
  readonly screen: StudioScreen;
  readonly editor: MazeEditor;
  readonly camera: CanvasCamera;
  readonly insets: Insets;
  readonly phone: boolean;
  /** Whether the main pointer is a finger, which has no shortcut help. */
  readonly coarse: boolean;
  /** The diff the board shows, if any. */
  readonly diff: MazeDiff | undefined;
  readonly onToggleDiff: () => void;
  readonly onChanges: () => void;
  /** The quick list's keys, while a maze is open in the editor. */
  readonly list: EditorShortcuts['list'];
}) {
  const state = useStore(store);
  const onScreen = screen.kind === 'library' ? undefined : screen.maze;
  const board = screen.kind === 'library' ? undefined : screen.board;
  const editing = screen.kind === 'editing';
  const editable = !editor.readOnly;
  const drawable = editing && screen.drawable;
  const maze = editing || screen.kind === 'previewing' ? screen.maze.maze : undefined;
  const showHint = useCallback(
    (text: string) => store.setState({ hint: { text, at: performance.now() } }),
    [store]
  );
  const boardKeys = useBoardKeys({
    editor,
    camera,
    maze: editing ? maze : undefined,
    board,
    insets,
    editable: editable && !state.viewing,
    tool: state.tool,
  });
  const wall = useWallDrawing({
    editor,
    camera,
    maze,
    board,
    enabled: drawable && state.tool === 'wall',
    onPress: boardKeys.hide,
  });
  const cells = useCellDrawing({
    editor,
    camera,
    maze,
    board,
    tool: drawable && isCellTool(state.tool) ? state.tool : undefined,
    onPress: boardKeys.hide,
  });
  const pickTool = useCallback(
    (next: Tool) => {
      if (next !== store.getState().tool) {
        store.setState({ tool: next, hint: { text: toolInfo(next).hint, at: performance.now() } });
      }
    },
    [store]
  );
  const { undo, redo, change, current } = editor;
  const closeBorder = useCallback(() => {
    const now = current();

    if (now !== undefined) {
      change(fillBorder(now));
    }
  }, [change, current]);
  const openHelp = useCallback(() => store.setState({ helpOpen: true }), [store]);
  const findings: readonly Finding[] =
    maze === undefined || onScreen === undefined
      ? []
      : validateMaze({
          maze,
          profile: onScreen.document.profile,
          source: onScreen.document.source,
        });
  const selected =
    onScreen !== undefined && state.finding?.maze === onScreen.key ? state.finding.key : undefined;
  const focused = findings.find((finding, index) => findingKey(finding, index) === selected);

  useEditorShortcuts({
    list,
    active: editing && !state.viewing && !state.listOpen,
    hand: !phone,
    onUndo: undo,
    onRedo: redo,
    onTool: pickTool,
    onCloseBorder: editable ? closeBorder : () => undefined,
    onToggleDiff,
    onHelp: coarse ? undefined : openHelp,
  });

  const reveal = (finding: Finding): void => {
    const area = maze === undefined ? undefined : focusArea(maze, finding);
    const view = camera.camera;
    const viewport = camera.limits?.viewport;

    if (
      area !== undefined &&
      maze !== undefined &&
      board !== undefined &&
      view !== undefined &&
      viewport !== undefined
    ) {
      camera.set(
        revealCamera(view, areaInWorld(boardGeometry(maze), board, area), viewport, insets)
      );
    }
  };

  const onCanvasKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (maze === undefined || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (boardKeys.press({ key: event.key, shiftKey: event.shiftKey })) {
      event.preventDefault();
    } else if (event.key === 'Escape' && selected !== undefined) {
      event.preventDefault();
      store.setState({ finding: undefined });
    }
  };

  const onCanvasFocus = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget && event.currentTarget.matches(':focus-visible')) {
      boardKeys.show();
    }
  };

  const boardKey = (key: BoardKey): void => {
    camera.element?.focus({ preventScroll: true });
    boardKeys.press(key);
  };

  return {
    drawing: wall.drawing ?? cells.drawing,
    overlays: {
      cursor: boardKeys.cursor,
      preview: wall.preview,
      selection: cells.selection ?? boardKeys.selection,
      focus: focused,
      diff,
    },
    cursor: boardKeys.cursor,
    drawingTool: wall.drawing !== undefined || cells.drawing !== undefined,
    onCanvasKey,
    onCanvasFocus,
    controls: {
      canRedo: editor.canRedo,
      canUndo: editor.canUndo,
      editable,
      hint: state.hint,
      onBoardKey: boardKey,
      onEdit: () => {
        store.setState({ viewing: false });
        showHint(EDIT_HINT);
      },
      onRedo: redo,
      onTool: pickTool,
      onUndo: undo,
      onView: () => store.setState({ viewing: true }),
      phone,
      tool: state.tool,
      touchMode: state.touchOpened,
      viewing: state.viewing,
    },
    checks:
      onScreen === undefined
        ? undefined
        : ({
            findings,
            profile: onScreen.document.profile,
            onProfile: editor.setProfile,
            selected,
            onSelect: (finding, key) => {
              store.setState({
                finding: key === undefined ? undefined : { maze: onScreen.key, key },
              });

              if (finding !== undefined) {
                reveal(finding);
              }
            },
            phone,
          } satisfies ChecksProps),
    actions: {
      editable,
      onCloseBorder: closeBorder,
      onChanges,
      onHelp: coarse ? undefined : openHelp,
    },
    help: {
      open: state.helpOpen,
      onOpenChange: (open) => store.setState({ helpOpen: open }),
    } satisfies ShortcutHelpProps,
  };
}
