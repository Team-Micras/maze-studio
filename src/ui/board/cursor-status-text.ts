import { edgeOfCell, hasWall, type Cell, type CellSide, type Maze } from '@/maze';

const SIDES: readonly CellSide[] = ['north', 'east', 'south', 'west'];

/** What the cursor status says about a cell: `Cell (4, 13)  walls north, west`. */
export function cursorStatusText(maze: Maze, cell: Cell): string {
  const walls = SIDES.filter((side) => hasWall(maze, edgeOfCell(cell, side)));
  return `Cell (${cell.x}, ${cell.y})  ${walls.length === 0 ? 'no walls' : `walls ${walls.join(', ')}`}`;
}
