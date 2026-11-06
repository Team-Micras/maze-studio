/**
 * Telling walls from gaps on the straightened board: a score per edge, and the threshold that
 * splits the scores of one photo in two.
 *
 * @module
 */

import type { Plane } from './image';

/** The scores of the edges of a board, in the order of the maze's wall sets. */
export interface EdgeScores {
  /** East–west edges, `(size + 1) × size`, index `y × size + x` as in `Maze.horizontal`. */
  readonly horizontal: Float32Array;
  /** North–south edges, `size × (size + 1)`, index `y × (size + 1) + x` as in `Maze.vertical`. */
  readonly vertical: Float32Array;
}

/** The board read with its coordinates turned to an edge: along it, and across it. */
type Reader = (along: number, across: number) => number;

/** The share of an edge's length left out at each end, where the posts and crossing walls are. */
const END_TRIM = 0.25;

/** How far across the edge line its wall top is looked for, as a share of a cell. */
const TOP_REACH = 0.1;

/** How far from the edge line its floor is looked for, as a share of a cell. */
const FLOOR_REACH = 0.45;

/** How wide a light band across an edge may be and still count as a wall top, as a share of a cell. */
const TOP_HAT_WIDTH = 0.75;

/** The value below which `share` of the values lie, `NaN` ones left out; `NaN` for none. */
function quantile(values: readonly number[], share: number): number {
  const finite = values.filter((value) => !Number.isNaN(value)).toSorted((a, b) => a - b);
  return finite.length === 0 ? Number.NaN : finite[Math.floor(share * (finite.length - 1))];
}

function lightest(values: readonly number[]): number {
  return values.reduce(
    (best, value) => (Number.isNaN(best) || value > best ? value : best),
    Number.NaN
  );
}

function darkest(values: readonly number[]): number {
  return values.reduce(
    (best, value) => (Number.isNaN(best) || value < best ? value : best),
    Number.NaN
  );
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, index) => from + index);
}

/** `board` read along and across the edges of one direction, `NaN` outside it. */
function readerOf(board: Plane, across: 'rows' | 'columns'): Reader {
  return (along, crossing) => {
    const [column, row] = across === 'rows' ? [along, crossing] : [crossing, along];
    return column < 0 || row < 0 || column >= board.width || row >= board.height
      ? Number.NaN
      : board.data[row * board.width + column];
  };
}

/**
 * The median, along every edge of a `size × size` board at `scale` pixels a cell, of what
 * `column(pixel, along, line)` measures at each position along it, `line` being the edge's pixel
 * boundary; east–west edges read `rows`, north–south ones `columns`, both with `(0, 0)` of the
 * board at the north-west corner.
 */
function alongEdges(
  rows: Reader,
  columns: Reader,
  size: number,
  scale: number,
  column: (pixel: Reader, along: number, line: number) => number
): EdgeScores {
  const trim = Math.round(END_TRIM * scale);
  const median = (pixel: Reader, line: number, segment: number) =>
    quantile(
      range(segment * scale + trim, (segment + 1) * scale - trim).map((along) =>
        column(pixel, along, line * scale)
      ),
      0.5
    );

  return {
    horizontal: Float32Array.from({ length: (size + 1) * size }, (_, index) =>
      median(rows, size - Math.floor(index / size), index % size)
    ),
    vertical: Float32Array.from({ length: size * (size + 1) }, (_, index) =>
      median(columns, index % (size + 1), size - 1 - Math.floor(index / (size + 1)))
    ),
  };
}

/**
 * The white top-hat of `board` across one direction: each pixel less the opening (the largest of
 * the smallest values) over a window `width` pixels long, which keeps the light bands narrower
 * than the window, the wall tops, and drops broad light regions, the sides of walls and glare.
 */
function topHat(board: Plane, width: number, across: 'rows' | 'columns'): Plane {
  const half = Math.floor(width / 2);
  const [step, count] = across === 'rows' ? [board.width, board.height] : [1, board.width];
  const slide = (data: Float32Array, pick: (a: number, b: number) => number) =>
    data.map((_, index) => {
      const position = across === 'rows' ? Math.floor(index / board.width) : index % board.width;
      let picked = Number.NaN;

      for (
        let offset = Math.max(-half, -position);
        offset <= Math.min(half, count - 1 - position);
        offset++
      ) {
        const value = data[index + offset * step];
        picked = Number.isNaN(picked) ? value : Number.isNaN(value) ? picked : pick(picked, value);
      }

      return picked;
    });
  const opened = slide(slide(board.data, Math.min), Math.max);
  return { ...board, data: board.data.map((value, index) => value - opened[index]) };
}

/**
 * The score of every edge of a `size × size` board straightened at `scale` pixels a cell, `(0, 0)`
 * at the north-west corner, higher where a wall top is lighter than the floor; `NaN` where the
 * photo did not reach. It is the mean of two scores, each set against its neighbours' by
 * {@link normaliseLocally}: at each position along the edge, the lightest pixel near the line
 * less the darkest floor on either side, which holds under glare; and the lightest pixel of the
 * board's top-hat across the edge, which ignores the broad side of a nearer wall.
 */
export function scoreEdges(board: Plane, size: number, scale: number): EdgeScores {
  const reach = Math.max(1, Math.round(TOP_REACH * scale));
  const far = Math.round(FLOOR_REACH * scale);
  const top = (pixel: Reader, along: number, line: number) =>
    lightest(range(line - reach, line + reach).map((across) => pixel(along, across)));
  const floor = (pixel: Reader, along: number, line: number) => {
    const sides = [
      darkest(range(line - far, line - reach).map((across) => pixel(along, across))),
      darkest(range(line + reach, line + far).map((across) => pixel(along, across))),
    ];
    return darkest(sides);
  };
  const width = Math.round(TOP_HAT_WIDTH * scale) | 1;
  const contrast = normaliseLocally(
    alongEdges(
      readerOf(board, 'rows'),
      readerOf(board, 'columns'),
      size,
      scale,
      (pixel, along, line) => top(pixel, along, line) - floor(pixel, along, line)
    ),
    size
  );
  const hat = normaliseLocally(
    alongEdges(
      readerOf(topHat(board, width, 'rows'), 'rows'),
      readerOf(topHat(board, width, 'columns'), 'columns'),
      size,
      scale,
      top
    ),
    size
  );

  return {
    horizontal: contrast.horizontal.map((value, index) => (value + hat.horizontal[index]) / 2),
    vertical: contrast.vertical.map((value, index) => (value + hat.vertical[index]) / 2),
  };
}

/**
 * The threshold that best splits `values` into two classes, by Otsu's method over a histogram of
 * 256 bins between their extremes; `NaN` values are left out.
 */
export function otsuThreshold(values: Iterable<number>): number {
  const finite = [...values].filter((value) => !Number.isNaN(value));

  if (finite.length === 0) {
    return Number.NaN;
  }

  const low = Math.min(...finite);
  const high = Math.max(...finite);

  if (high === low) {
    return low;
  }

  const bins = 256;
  const histogram = new Float64Array(bins);

  for (const value of finite) {
    histogram[Math.min(bins - 1, Math.floor(((value - low) / (high - low)) * bins))]++;
  }

  const total = finite.length;
  const sum = histogram.reduce((acc, count, bin) => acc + count * bin, 0);
  let below = 0;
  let belowSum = 0;
  let best = 0;
  let bestBin = 0;

  for (let bin = 0; bin < bins - 1; bin++) {
    below += histogram[bin];
    belowSum += histogram[bin] * bin;
    const above = total - below;

    if (below > 0 && above > 0) {
      const between = below * above * (belowSum / below - (sum - belowSum) / above) ** 2;

      if (between > best) {
        best = between;
        bestBin = bin;
      }
    }
  }

  return low + ((bestBin + 1) / bins) * (high - low);
}

/** How far around an edge its neighbours reach, in cells, for {@link normaliseLocally}. */
const LOCAL_RADIUS = 2;

/** The share of the neighbours' scores that lie below the one an edge is divided by. */
const LOCAL_QUANTILE = 0.9;

/** The least an edge is divided by, as a share of the same quantile over the whole board. */
const LOCAL_FLOOR = 0.5;

/** The least an edge is divided by, so that a photo whose tops show no contrast stays near zero. */
const LOCAL_MINIMUM = 0.1;

/**
 * Each score divided by a high quantile of the scores within a few cells of its edge, so that a
 * part of the photo where walls and floor are both lighter or darker, under glare or shadow,
 * splits at the same threshold as the rest.
 */
export function normaliseLocally(scores: EdgeScores, size: number): EdgeScores {
  const middles = [
    ...Array.from(scores.horizontal, (score, index) => ({
      x: (index % size) + 0.5,
      y: Math.floor(index / size),
      score,
    })),
    ...Array.from(scores.vertical, (score, index) => ({
      x: index % (size + 1),
      y: Math.floor(index / (size + 1)) + 0.5,
      score,
    })),
  ];
  const seen = middles.filter((middle) => !Number.isNaN(middle.score));
  const lowest = Math.max(
    LOCAL_MINIMUM,
    LOCAL_FLOOR *
      quantile(
        seen.map((middle) => middle.score),
        LOCAL_QUANTILE
      )
  );
  const normalised = middles.map(({ x, y, score }) => {
    const near = seen.filter(
      (middle) => Math.abs(middle.x - x) <= LOCAL_RADIUS && Math.abs(middle.y - y) <= LOCAL_RADIUS
    );
    return (
      score /
      Math.max(
        lowest,
        quantile(
          near.map((middle) => middle.score),
          LOCAL_QUANTILE
        )
      )
    );
  });

  return {
    horizontal: Float32Array.from(normalised.slice(0, scores.horizontal.length)),
    vertical: Float32Array.from(normalised.slice(scores.horizontal.length)),
  };
}
