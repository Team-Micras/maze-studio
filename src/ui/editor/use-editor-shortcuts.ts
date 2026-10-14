import { useEffect } from 'react';

import { typingIn } from '@/ui/typing-in';

import { toolOfKey, type Tool } from './tools';

/** What the editor's shortcuts do. */
export interface EditorShortcuts {
  /**
   * The quick list's keys while a maze is open in the editor: `L` opens the list, `[` and `]` step
   * to the maze before or after; none while nothing is open.
   */
  readonly list?: { readonly onOpen: () => void; readonly onStep: (step: 1 | -1) => void };
  /** Whether the maze open is edited, where the other shortcuts work. */
  readonly active: boolean;
  /** Whether the hand is offered, as on a notebook. */
  readonly hand: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onTool: (tool: Tool) => void;
  /** Closes the outer walls, on `B`. */
  readonly onCloseBorder: () => void;
  /** Shows or hides the diff on the board, on `D`. */
  readonly onToggleDiff: () => void;
  /** Opens the shortcut help, on `?`; none on a touch screen. */
  readonly onHelp?: () => void;
}

/**
 * The editor's keys anywhere on the page (DESIGN.md 11): Ctrl or Cmd with Z undoes, with Shift and
 * Z or with Y redoes; `H`, `W`, `R`, `C`, `S` and `G` pick the tools, `B` closes the outer walls,
 * `D` shows or hides the diff and `?` opens the shortcut help; `L`, `[` and `]` work the quick list
 * whenever a maze is open. None fires while the focus is in a text field.
 */
export function useEditorShortcuts({
  list,
  active,
  hand,
  onUndo,
  onRedo,
  onTool,
  onCloseBorder,
  onToggleDiff,
  onHelp,
}: EditorShortcuts): void {
  useEffect(() => {
    if (list === undefined && !active) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (typingIn(event.target) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (list !== undefined && !event.ctrlKey && !event.metaKey) {
        if (key === 'l') {
          event.preventDefault();
          list.onOpen();
          return;
        }

        if (key === '[' || key === ']') {
          event.preventDefault();
          list.onStep(key === ']' ? 1 : -1);
          return;
        }
      }

      if (!active) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          onUndo();
        } else if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey)) {
          event.preventDefault();
          onRedo();
        }

        return;
      }

      if (key === 'b') {
        event.preventDefault();
        onCloseBorder();
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        onToggleDiff();
        return;
      }

      if (event.key === '?' && onHelp !== undefined) {
        event.preventDefault();
        onHelp();
        return;
      }

      const tool = toolOfKey(key);

      if (tool !== undefined && (tool !== 'hand' || hand)) {
        event.preventDefault();
        onTool(tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, active, hand, onUndo, onRedo, onTool, onCloseBorder, onToggleDiff, onHelp]);
}
