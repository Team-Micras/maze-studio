import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Eye,
  HandGrabbing,
  PencilSimpleLine,
} from '@phosphor-icons/react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Toolbar } from 'radix-ui';

import { Hint, Island, IslandSeparator } from '@/ui/islands/island';
import { shortcutLabel } from '@/ui/platform';
import { cn } from '@/ui/primitives/utils';

import { isArrow, type BoardKey } from './use-board-keys';

/** The editor's tools in slice 5a: the hand pans, the wall tool draws walls. */
export type Tool = 'hand' | 'wall';

/** The props of {@link ToolsIsland}. */
export interface ToolsIslandProps {
  readonly tool: Tool;
  readonly onTool: (tool: Tool) => void;
  readonly phone: boolean;
  /** Whether the tools change the maze; not while another tab holds a newer version. */
  readonly editable: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  /** Leaves edit mode for view mode, on a phone or after a touch. */
  readonly onView?: () => void;
  /** Hands the board a key the island does not keep: `↑`, `↓` and every Shift and arrow. */
  readonly onBoardKey: (key: BoardKey) => void;
  readonly className?: string;
}

const ITEM =
  'inline-flex size-10 flex-none items-center justify-center rounded-[10px] text-foreground outline-none transition-[background-color,transform] duration-100 ease-(--ease) hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 aria-checked:bg-primary aria-checked:text-primary-foreground max-[720px]:h-11';

interface ToolItemProps {
  readonly value: Tool;
  readonly label: string;
  readonly shortcut: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

function ToolItem({ value, label, shortcut, disabled = false, children }: ToolItemProps) {
  return (
    <Hint label={label} shortcut={shortcut}>
      <Toolbar.ToggleItem aria-label={label} className={ITEM} disabled={disabled} value={value}>
        {children}
      </Toolbar.ToggleItem>
    </Hint>
  );
}

/**
 * The tools island at the bottom centre (DESIGN.md 6 and 9): a Radix toolbar whose tools are a
 * single-choice group with roving focus, then undo and redo. `←` and `→` move the focus between
 * them; `↑`, `↓` and Shift with any arrow go to the board's cursor, and the focus with them. The
 * active tool cannot be clicked off. On a phone the hand gives way to the eye back to view mode.
 */
export function ToolsIsland({
  tool,
  onTool,
  phone,
  editable,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onView,
  onBoardKey,
  className,
}: ToolsIslandProps) {
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>): void => {
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';

    if (isArrow(event.key) && (vertical || event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      onBoardKey({ key: event.key, shiftKey: event.shiftKey });
    }
  };

  return (
    <Island className={cn('fixed bottom-[18px] left-1/2 -translate-x-1/2', className)}>
      <Toolbar.Root
        aria-label="Tools"
        className="flex items-center gap-0.5"
        onKeyDownCapture={onKeyDownCapture}
        orientation="horizontal"
      >
        {onView === undefined ? null : (
          <>
            <Hint label="Back to viewing">
              <Toolbar.Button
                aria-label="Done editing, back to viewing"
                className={cn(ITEM, 'bg-muted')}
                onClick={onView}
              >
                <Eye aria-hidden size={18} />
              </Toolbar.Button>
            </Hint>
            <IslandSeparator />
          </>
        )}
        <Toolbar.ToggleGroup
          aria-label="Tool"
          className="flex items-center gap-0.5"
          onValueChange={(value) => {
            if (value === 'hand' || value === 'wall') {
              onTool(value);
            }
          }}
          type="single"
          value={tool}
        >
          {phone ? null : (
            <ToolItem label="Hand" shortcut="H" value="hand">
              <HandGrabbing aria-hidden size={18} />
            </ToolItem>
          )}
          <ToolItem disabled={!editable} label="Wall" shortcut="W" value="wall">
            <PencilSimpleLine aria-hidden size={18} />
          </ToolItem>
        </Toolbar.ToggleGroup>
        <Toolbar.Separator className="mx-1 h-5 w-px flex-none bg-border" />
        <Hint label="Undo" shortcut={shortcutLabel('Ctrl Z')}>
          <Toolbar.Button
            aria-label="Undo"
            className={ITEM}
            disabled={!editable || !canUndo}
            onClick={onUndo}
          >
            <ArrowCounterClockwise aria-hidden size={18} />
          </Toolbar.Button>
        </Hint>
        <Hint label="Redo" shortcut={shortcutLabel('Ctrl Shift Z')}>
          <Toolbar.Button
            aria-label="Redo"
            className={ITEM}
            disabled={!editable || !canRedo}
            onClick={onRedo}
          >
            <ArrowClockwise aria-hidden size={18} />
          </Toolbar.Button>
        </Hint>
      </Toolbar.Root>
    </Island>
  );
}
