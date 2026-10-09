import { useCallback, type KeyboardEvent } from 'react';
import type { StoreApi } from 'zustand';

import { fillBorder, validateMaze, type Cell, type Finding } from '@/maze';
import {
  areaInWorld,
  boardGeometry,
  focusArea,
  revealCamera,
  type BoardOverlays,
  type Insets,
  type WorldRect,
} from '@/render';
import type { StageDrawing } from '@/ui/board/camera-stage';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import type { ChecksProps } from '@/ui/editor/checks';
import { findingKey } from '@/ui/editor/checks-summary';
import type { EditControlsProps } from '@/ui/editor/edit-controls';
import type { MoreActionsProps } from '@/ui/editor/more-actions';
import type { ShortcutHelpProps } from '@/ui/editor/shortcut-help';
import { toolInfo, type Tool } from '@/ui/editor/tools';
import { useBoardKeys, type BoardKey } from '@/ui/editor/use-board-keys';
import { isCellTool, useCellDrawing } from '@/ui/editor/use-cell-drawing';
import { useEditorShortcuts } from '@/ui/editor/use-editor-shortcuts';
import type { MazeEditor } from '@/ui/editor/use-maze-editor';
import { useWallDrawing } from '@/ui/editor/use-wall-drawing';
import type { OpenMaze } from '@/ui/open-maze';

import type { StudioState } from './studio-store';

/** What editing the maze on screen depends on. */
export interface StudioEditingInput {
  readonly store: StoreApi<StudioState>;
  readonly state: StudioState;
  readonly editor: MazeEditor;
  readonly camera: CanvasCamera;
  /** The maze on screen, if any, and whether it is a preview of the quick list. */
  readonly onScreen: OpenMaze | undefined;
  readonly previewing: boolean;
  readonly board: WorldRect | undefined;
  readonly insets: Insets;
  readonly phone: boolean;
  /** Whether the main pointer is a finger, which has no shortcut help. */
  readonly coarse: boolean;
}

/** What the studio hands the canvas, the board and the editor's islands. */
export interface StudioEditing {
  readonly drawing: StageDrawing | undefined;
  readonly overlays: BoardOverlays;
  readonly cursor: Cell | undefined;
  /** Whether a tool draws with the pointer, which shows a crosshair. */
  readonly drawingTool: boolean;
  readonly onCanvasKey: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly controls: EditControlsProps;
  readonly checks: ChecksProps | undefined;
  readonly actions: MoreActionsProps;
  readonly help: ShortcutHelpProps;
}

const EDIT_HINT = 'Tap a slot to toggle. Drag to draw. Two fingers pan';

const TOO_SMALL_HINT = 'Zoom in to edit';

/**
 * Editing the maze on screen in the studio (PLAN.md 3.4): the tool that draws with the pointer, the
 * keyboard cursor, the shortcuts, the checks with the finding shown on the board, and the editor's
 * menu and help. Nothing edits while the maze is only looked at, previewed from the quick list, or
 * held by a newer version in another tab.
 */
export function useStudioEditing({
  store,
  state,
  editor,
  camera,
  onScreen,
  previewing,
  board,
  insets,
  phone,
  coarse,
}: StudioEditingInput): StudioEditing {
  const open = state.mode === 'editor' && board !== undefined && onScreen !== undefined;
  const editable = !editor.readOnly;
  const drawable = open && !previewing && !state.listOpen && !state.viewing && editable;
  const maze = open ? onScreen.maze : undefined;
  const showHint = useCallback(
    (text: string) => store.setState({ hint: { text, at: performance.now() } }),
    [store]
  );
  const boardKeys = useBoardKeys({
    editor,
    camera,
    maze: open && !previewing ? maze : undefined,
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
    onTooSmall: () => showHint(TOO_SMALL_HINT),
    onPress: boardKeys.hide,
  });
  const cells = useCellDrawing({
    editor,
    camera,
    maze,
    board,
    tool: drawable && isCellTool(state.tool) ? state.tool : undefined,
    onTooSmall: () => showHint(TOO_SMALL_HINT),
    onPress: boardKeys.hide,
  });
  const pickTool = useCallback(
    (tool: Tool) => {
      if (tool !== store.getState().tool) {
        store.setState({ tool, hint: { text: toolInfo(tool).hint, at: performance.now() } });
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
          ...(onScreen.document.source === undefined ? {} : { source: onScreen.document.source }),
        });
  const selected =
    onScreen !== undefined && state.finding?.maze === onScreen.key ? state.finding.key : undefined;
  const focused = findings.find((finding, index) => findingKey(finding, index) === selected);

  useEditorShortcuts({
    active: open && !state.viewing && !state.listOpen && !previewing,
    hand: !phone,
    onUndo: undo,
    onRedo: redo,
    onTool: pickTool,
    onCloseBorder: editable ? closeBorder : () => undefined,
    ...(coarse ? {} : { onHelp: openHelp }),
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
    if (!open || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (boardKeys.press({ key: event.key, shiftKey: event.shiftKey })) {
      event.preventDefault();
    } else if (event.key === 'Escape' && selected !== undefined) {
      event.preventDefault();
      store.setState({ finding: undefined });
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
      ...(wall.preview === undefined ? {} : { preview: wall.preview }),
      ...((cells.selection ?? boardKeys.selection) === undefined
        ? {}
        : { selection: cells.selection ?? boardKeys.selection }),
      ...(focused === undefined ? {} : { focus: focused }),
    },
    cursor: boardKeys.cursor,
    drawingTool: wall.drawing !== undefined || cells.drawing !== undefined,
    onCanvasKey,
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
        : {
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
          },
    actions: { editable, onCloseBorder: closeBorder, ...(coarse ? {} : { onHelp: openHelp }) },
    help: {
      open: state.helpOpen,
      onOpenChange: (helpOpen) => store.setState({ helpOpen }),
    },
  };
}
