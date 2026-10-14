import { edgeOfCell, hasWall, type Cell, type CellSide, type Maze } from '@/maze';
import { cn } from '@/ui/primitives/utils';

const SIDES: readonly CellSide[] = ['north', 'east', 'south', 'west'];

/** What the cursor status says about a cell: `Cell (4, 13)  walls north, west`. */
function cursorStatusText(maze: Maze, cell: Cell): string {
  const walls = SIDES.filter((side) => hasWall(maze, edgeOfCell(cell, side)));
  return `Cell (${cell.x}, ${cell.y})  ${walls.length === 0 ? 'no walls' : `walls ${walls.join(', ')}`}`;
}

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
