/**
 * `maze-label/1`: one JSON file per photo of a maze, with what the recogniser is measured against.
 * `maze-label.schema.json` is the same format as a JSON Schema, for other tools; this module is
 * its type and a small validator. The walls are not stored: they are read from the maze file.
 *
 * Coordinates are image pixels with pixel centres at whole numbers (`centre-integer`, as the
 * recogniser takes them) or at halves (`corner-integer`, as a browser click gives them). Corners
 * run north-west, north-east, south-east, south-west in the maze file's order, at the centre of
 * the top of the corner post; a corner may lie outside the image, or be `null` when it cannot be
 * placed, as past the fold radius of a lens.
 *
 * @module
 */

import { failure, success, type Result } from '@/maze';
import type { Point } from '@/photo';

/** Where a set of corners came from. */
export const CORNER_SOURCES = ['clicked', 'projected', 'lensfit', 'oracle'] as const;

/**
 * Where a set of corners came from: `clicked` by a person, `projected` from a known camera,
 * `lensfit` the corner posts of a lens fitted to the maze's posts, `oracle` fitted against the
 * true maze.
 */
export type CornerSource = (typeof CORNER_SOURCES)[number];

/** A point in image pixels, `[x, y]`. */
export type Pixel = readonly [number, number];

/** The four corners of one source, and which of them lie inside the image. */
export interface CornerSet {
  readonly image: readonly [Pixel | null, Pixel | null, Pixel | null, Pixel | null];
  readonly inFrame: readonly [boolean, boolean, boolean, boolean];
}

/** A pinhole or fisheye camera in OpenCV's conventions, row-major matrices. */
export interface Camera {
  readonly model: 'opencv' | 'opencv-fisheye' | 'none';
  readonly K: readonly number[];
  readonly dist: readonly number[];
  readonly R: readonly number[];
  readonly t: readonly number[];
  readonly provenance: 'exact' | 'fit';
  /** The radius in pixels around the principal point inside which the model holds. */
  readonly validRadius: number;
}

/** A label of `maze-label/1`. */
export interface MazeLabel {
  readonly schema: 'maze-label/1';
  readonly id: string;
  /** The image, its path relative to the label's folder. */
  readonly image: {
    readonly file: string;
    readonly sha256: string;
    readonly width: number;
    readonly height: number;
  };
  readonly pixelConvention: 'centre-integer' | 'corner-integer';
  /** The true maze, its path relative to `vendor/mazefiles`. */
  readonly maze: { readonly file: string; readonly size: number };
  /** One set of corners per source, at least one. */
  readonly corners: Readonly<Partial<Record<CornerSource, CornerSet>>>;
  /**
   * From board cells (`x` east and `y` south from the north-west corner) to image pixels,
   * row-major 3 × 3; with `lensFitApp`, to the image that lens leaves undistorted.
   */
  readonly homography?: readonly number[];
  readonly camera?: Camera;
  /**
   * The one-parameter radial lens of the dataset's tools: a point `q` of the undistorted image is
   * seen at `centre + (q − centre)(1 + k1 r²)`, `r` being `|q − centre|` over half the image's
   * diagonal.
   */
  readonly lensFitApp?: {
    readonly model: 'radial-halfdiag';
    readonly k1: number;
    readonly centre: Pixel;
  };
  /** Each post `(x, y)` of the maze at index `y × (size + 1) + x`, `y` from the south. */
  readonly posts?: {
    readonly image: readonly (Pixel | null)[];
    readonly visible: readonly boolean[];
  };
  /** The share of each edge's wall top in view, horizontal edges then vertical ones. */
  readonly edges?: { readonly visibleFraction: readonly number[] };
  /** Image files by name, such as `robot` or `glare`, relative to the label's folder. */
  readonly masks?: Readonly<Record<string, string>>;
  /** What the photo is like, such as `distortion` (`none`, `mild`, `fisheye`) or `view`. */
  readonly factors?: Readonly<Record<string, string | number>>;
  /** Who or what made each part of the label. */
  readonly provenance?: Readonly<Record<string, string>>;
}

type Check = (value: unknown, path: string) => string | undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finite: Check = (value, path) =>
  typeof value === 'number' && Number.isFinite(value) ? undefined : `${path} is not a number`;

const positive: Check = (value, path) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? undefined
    : `${path} is not a whole number above 0`;

const text: Check = (value, path) =>
  typeof value === 'string' && value !== '' ? undefined : `${path} is not a text`;

const oneOf =
  (...options: readonly string[]): Check =>
  (value, path) =>
    typeof value === 'string' && options.includes(value)
      ? undefined
      : `${path} is not one of ${options.join(', ')}`;

const list =
  (item: Check, length?: number): Check =>
  (value, path) => {
    if (!Array.isArray(value) || (length !== undefined && value.length !== length)) {
      return `${path} is not a list${length === undefined ? '' : ` of ${length}`}`;
    }

    return value.map((entry, index) => item(entry, `${path}[${index}]`)).find(Boolean);
  };

const pixel = list(finite, 2);

const pixelOrNull: Check = (value, path) => (value === null ? undefined : pixel(value, path));

const flag: Check = (value, path) =>
  typeof value === 'boolean' ? undefined : `${path} is not true or false`;

const fields =
  (required: Record<string, Check>, optional: Record<string, Check> = {}): Check =>
  (value, path) => {
    if (!isObject(value)) {
      return `${path} is not an object`;
    }

    return [
      ...Object.entries(required).map(([key, check]) =>
        key in value ? check(value[key], `${path}.${key}`) : `${path}.${key} is missing`
      ),
      ...Object.entries(optional).map(([key, check]) =>
        key in value ? check(value[key], `${path}.${key}`) : undefined
      ),
    ].find(Boolean);
  };

const record =
  (item: Check): Check =>
  (value, path) =>
    isObject(value)
      ? Object.entries(value)
          .map(([key, entry]) => item(entry, `${path}.${key}`))
          .find(Boolean)
      : `${path} is not an object`;

const cornerSet = fields({ image: list(pixelOrNull, 4), inFrame: list(flag, 4) });

const corners: Check = (value, path) => {
  const keys = isObject(value) ? Object.keys(value) : [];
  return (
    record(cornerSet)(value, path) ??
    keys.map((key) => oneOf(...CORNER_SOURCES)(key, `${path} key ${key}`)).find(Boolean) ??
    (keys.length === 0 ? `${path} has no set` : undefined)
  );
};

const label = fields(
  {
    schema: oneOf('maze-label/1'),
    id: text,
    image: fields({ file: text, sha256: text, width: positive, height: positive }),
    pixelConvention: oneOf('centre-integer', 'corner-integer'),
    maze: fields({ file: text, size: positive }),
    corners,
  },
  {
    homography: list(finite, 9),
    camera: fields({
      model: oneOf('opencv', 'opencv-fisheye', 'none'),
      K: list(finite, 9),
      dist: list(finite),
      R: list(finite, 9),
      t: list(finite, 3),
      provenance: oneOf('exact', 'fit'),
      validRadius: finite,
    }),
    lensFitApp: fields({ model: oneOf('radial-halfdiag'), k1: finite, centre: pixel }),
    posts: fields({ image: list(pixelOrNull), visible: list(flag) }),
    edges: fields({ visibleFraction: list(finite) }),
    masks: record(text),
    factors: record((value, path) => (typeof value === 'string' ? undefined : finite(value, path))),
    provenance: record(text),
  }
);

function sizedLists(value: MazeLabel): string | undefined {
  const { size } = value.maze;
  const posts = (size + 1) * (size + 1);
  const edges = 2 * size * (size + 1);

  if (value.posts !== undefined) {
    if (value.posts.image.length !== posts || value.posts.visible.length !== posts) {
      return `label.posts holds ${posts} posts for a maze of ${size}`;
    }
  }

  if (value.edges !== undefined && value.edges.visibleFraction.length !== edges) {
    return `label.edges.visibleFraction holds ${edges} edges for a maze of ${size}`;
  }

  return undefined;
}

function shaped(value: unknown): value is MazeLabel {
  return label(value, 'label') === undefined;
}

/** `value` as a label of `maze-label/1`, or the first thing wrong with it. */
export function readMazeLabel(value: unknown): Result<MazeLabel, string> {
  const error = shaped(value) ? sizedLists(value) : label(value, 'label');
  return shaped(value) && error === undefined ? success(value) : failure(error ?? '');
}

/**
 * The corners as the recogniser takes them, pixel centres at whole numbers, or `undefined` when
 * the label has no set from `source` or one of its corners is `null`.
 */
export function cornersOf(
  value: MazeLabel,
  source: CornerSource
): [Point, Point, Point, Point] | undefined {
  const image: readonly (Pixel | null)[] = value.corners[source]?.image ?? [];
  const shift = value.pixelConvention === 'corner-integer' ? 0.5 : 0;

  const placed = image.filter((corner): corner is Pixel => corner !== null);

  if (placed.length !== 4) {
    return undefined;
  }

  const [a, b, c, d] = placed.map(([x, y]) => ({ x: x - shift, y: y - shift }));
  return [a, b, c, d];
}
