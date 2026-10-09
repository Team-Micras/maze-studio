/**
 * The layout of the mazefiles text format: each cell is 4 columns by 2 lines of text. Even lines
 * hold the posts, an `o` every 4 columns, with `---` between two posts for an east–west wall; odd
 * lines hold a `|` on each post column for a north–south wall and the cell's mark (`S`, `G` or a
 * space) in the middle of the 3 columns between. The first line is the north edge of the maze.
 *
 * @module
 */

/** The character of a post. */
export const POST = 'o';

/** The text between two posts with an east–west wall. */
export const HORIZONTAL_WALL = '---';

/** The text between two posts with no east–west wall. */
export const NO_HORIZONTAL_WALL = '   ';

/** The character of a north–south wall. */
export const VERTICAL_WALL = '|';

/** The character of no north–south wall, and of an unmarked cell. */
export const BLANK = ' ';

/** The mark of the start cell. */
export const START_MARK = 'S';

/** The mark of a goal cell. */
export const GOAL_MARK = 'G';

/** Columns of text per cell. */
export const COLUMNS_PER_CELL = 4;

/** How many characters a line of a maze `width` cells wide has. */
export function lineLength(width: number): number {
  return COLUMNS_PER_CELL * width + 1;
}

/** How many lines of text the grid of a maze `height` cells tall has. */
export function lineCount(height: number): number {
  return 2 * height + 1;
}
