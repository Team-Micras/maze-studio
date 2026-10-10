import { useEffect } from 'react';

import { typingIn } from '@/ui/typing-in';

import { toolOfKey, type Tool } from './tools';

/** What the editor's shortcuts do. */
export interface EditorShortcuts {
  /** Whether a maze is open in the editor, where the shortcuts work. */
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
 * `D` shows or hides the diff and `?` opens the shortcut help. None fires while the focus is in a text field.
 */
export function useEditorShortcuts({
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
    if (!active) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (typingIn(event.target) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

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
  }, [active, hand, onUndo, onRedo, onTool, onCloseBorder, onToggleDiff, onHelp]);
}
