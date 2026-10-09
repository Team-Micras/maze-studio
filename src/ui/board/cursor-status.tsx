import type { Cell, Maze } from '@/maze';
import { cn } from '@/ui/primitives/utils';

import { cursorStatusText } from './cursor-status-text';

/** The props of {@link CursorStatus}. */
export interface CursorStatusProps {
  readonly maze: Maze;
  /** The keyboard cursor's cell, or `undefined` while the cursor is hidden. */
  readonly cell: Cell | undefined;
  readonly className?: string;
}

/**
 * The keyboard cursor's cell and its walls, in mono, announced politely as it moves (DESIGN.md 6).
 * Empty while the cursor is hidden, so the live region stays in place.
 */
export function CursorStatus({ maze, cell, className }: CursorStatusProps) {
  return (
    <p
      aria-live="polite"
      className={cn(
        'font-mono text-xs whitespace-pre text-muted-foreground tabular-nums',
        className
      )}
      translate="no"
    >
      {cell === undefined ? '' : cursorStatusText(maze, cell)}
    </p>
  );
}
