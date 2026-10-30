/**
 * Thumbnails: a maze painted on a canvas at thumbnail scale (no rails, thick walls), on demand, in
 * fixed bands of 64, 128, 256 and 512 pixels on the longest side, and kept in caches bounded by
 * the bytes of the bitmaps (PLAN.md 3.3, DESIGN.md 7): one for the small bands, roomy enough for a
 * preview of every maze, and one for the large bands. The library, the minimap, the quick list
 * and the Changes panel, which draws the diff on top, all take them from here.
 *
 * @module
 */

import type { Maze, MazeDiff } from '@/maze';

import { boardGeometry, type BoardGeometry } from './geometry';
import { LruCache } from './lru-cache';
import { diffLayers, overlayStrokes } from './overlay-layers';
import { TRACK_COLORS, TRACK_OPACITY } from './track-colors';
import { trackLayers } from './track-layers';

/** The sizes a thumbnail is drawn at, in device pixels on its longest side. */
export const THUMBNAIL_BANDS = [64, 128, 256, 512] as const;

/** One of {@link THUMBNAIL_BANDS}. */
export type ThumbnailBand = (typeof THUMBNAIL_BANDS)[number];

/** The bytes the cached thumbnails of the bands past {@link PREVIEW_BAND} may add up to: 64 MB. */
export const THUMBNAIL_CACHE_BYTES = 64 * 1024 * 1024;

/**
 * The largest band kept with the previews: drawn in less than half the time of the 512 band, and
 * still showing a 32 × 32 maze's walls (decisions.md).
 */
export const PREVIEW_BAND = 128;

/**
 * The bytes the cached thumbnails up to {@link PREVIEW_BAND} may add up to: 40 MB, a square
 * preview of 64 KB for each of 640 mazes, more than the repository holds.
 */
export const PREVIEW_CACHE_BYTES = 40 * 1024 * 1024;

/** The size of a thumbnail's bitmap, in device pixels. */
export interface ThumbnailSize {
  readonly width: number;
  readonly height: number;
}

/** A 2D context of an on-screen or offscreen canvas. */
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The smallest band at least `pixels` long, or the largest band past it. */
export function thumbnailBand(pixels: number): ThumbnailBand {
  return THUMBNAIL_BANDS.find((band) => band >= pixels) ?? 512;
}

/** The bitmap size of a thumbnail of `maze` in `band`. */
export function thumbnailSize(
  maze: Pick<Maze, 'width' | 'height'>,
  band: ThumbnailBand
): ThumbnailSize {
  const geometry = boardGeometry(maze, { scale: 'thumbnail', size: band });
  return {
    width: Math.max(1, Math.round(geometry.width)),
    height: Math.max(1, Math.round(geometry.height)),
  };
}

/** The bytes of a bitmap of that size, four per pixel. */
export function thumbnailBytes(size: ThumbnailSize): number {
  return size.width * size.height * 4;
}

function fill(context: Canvas2D, path: string, color: string, alpha = 1): void {
  if (path === '') {
    return;
  }

  const shape = new Path2D(path);
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.fill(shape);
  context.globalAlpha = 1;
}

function stroke(
  context: Canvas2D,
  path: string,
  width: number,
  dash: readonly number[] = []
): void {
  if (path === '') {
    return;
  }

  context.strokeStyle = TRACK_COLORS.diff;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.stroke(new Path2D(path));
  context.setLineDash([]);
}

function paintPosts(context: Canvas2D, path: string, color: string, geometry: BoardGeometry): void {
  fill(context, path, color);

  if (path !== '' && geometry.postOutline > 0) {
    context.strokeStyle = TRACK_COLORS.floor;
    context.lineWidth = geometry.postOutline;
    context.stroke(new Path2D(path));
  }
}

/**
 * Paints the track of `maze` drawn with `geometry` on `context`, in board units, and the diff on
 * top when one is given.
 */
export function paintTrack(
  context: Canvas2D,
  maze: Maze,
  geometry: BoardGeometry,
  diff?: MazeDiff
): void {
  const layers = trackLayers(maze, geometry);
  fill(context, layers.floor, TRACK_COLORS.floor);
  fill(context, layers.rails, TRACK_COLORS.rail);
  fill(context, layers.goal, TRACK_COLORS.goal, TRACK_OPACITY.goal);

  if (layers.start !== '') {
    context.globalAlpha = TRACK_OPACITY.start;
    context.strokeStyle = TRACK_COLORS.bare;
    context.lineWidth = geometry.startStroke;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke(new Path2D(layers.start));
    context.globalAlpha = 1;
  }

  fill(context, layers.redWalls, TRACK_COLORS.wall);
  fill(context, layers.bareWalls, TRACK_COLORS.bare);
  paintPosts(context, layers.redPosts, TRACK_COLORS.post, geometry);
  paintPosts(context, layers.barePosts, TRACK_COLORS.bare, geometry);

  if (diff !== undefined) {
    const paths = diffLayers(geometry, diff);
    const strokes = overlayStrokes(geometry);
    fill(context, paths.added, TRACK_COLORS.diff, TRACK_OPACITY.diffFill);
    stroke(context, paths.added, strokes.diff);
    stroke(context, paths.marked, strokes.diff);
    stroke(context, paths.dashed, strokes.diff, strokes.diffDash);
  }
}

/** A new thumbnail of `maze` in `band`, with the diff on top when one is given. */
export function drawThumbnail(maze: Maze, band: ThumbnailBand, diff?: MazeDiff): OffscreenCanvas {
  const size = thumbnailSize(maze, band);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('this browser gives no 2D context for an OffscreenCanvas');
  }

  const geometry = boardGeometry(maze, { scale: 'thumbnail', size: band });
  context.scale(size.width / geometry.width, size.height / geometry.height);
  paintTrack(context, maze, geometry, diff);
  return canvas;
}

/**
 * Thumbnails by key and band, drawn on first use and kept in two LRUs bounded by bytes, so the
 * large bitmaps never push out the previews.
 */
export class ThumbnailCache {
  readonly #large: LruCache<OffscreenCanvas>;
  readonly #small: LruCache<OffscreenCanvas>;

  /**
   * @param capacity The bytes the bitmaps past {@link PREVIEW_BAND} may add up to; 64 MB by default.
   * @param previewCapacity The bytes the others may add up to; 40 MB by default.
   */
  constructor(capacity = THUMBNAIL_CACHE_BYTES, previewCapacity = PREVIEW_CACHE_BYTES) {
    this.#large = new LruCache(capacity);
    this.#small = new LruCache(previewCapacity);
  }

  /** The bytes the cached bitmaps add up to. */
  get bytes(): number {
    return this.#large.bytes + this.#small.bytes;
  }

  /**
   * The thumbnail of `maze` for a place `pixels` device pixels long, in the smallest band that
   * covers it, from the cache or drawn now.
   *
   * @param key What identifies the maze: the same key must always mean the same maze, such as its
   *   compact code.
   */
  thumbnail(key: string, maze: Maze, pixels: number): OffscreenCanvas {
    const band = thumbnailBand(pixels);
    return this.#cached(band, `${band}:${key}`, () => drawThumbnail(maze, band));
  }

  /**
   * The thumbnail of `maze` with `diff` drawn on top, kept apart from the plain thumbnail of the
   * same maze.
   *
   * @param key What identifies the maze, as for {@link ThumbnailCache.thumbnail}.
   * @param diffKey What identifies the diff, such as the compact code of the maze it is taken
   *   from: the same pair of keys must always mean the same maze and diff.
   */
  diffThumbnail(
    key: string,
    diffKey: string,
    maze: Maze,
    pixels: number,
    diff: MazeDiff
  ): OffscreenCanvas {
    const band = thumbnailBand(pixels);
    return this.#cached(band, `${band}:${key}:diff:${diffKey}`, () =>
      drawThumbnail(maze, band, diff)
    );
  }

  /**
   * The thumbnail of the maze `key` names for a place `pixels` device pixels long, if it is
   * already drawn; never draws, so a caller can show what is ready at once and draw the rest
   * later.
   */
  cached(key: string, pixels: number): OffscreenCanvas | undefined {
    const band = thumbnailBand(pixels);
    return this.#cacheOf(band).get(`${band}:${key}`);
  }

  #cacheOf(band: ThumbnailBand): LruCache<OffscreenCanvas> {
    return band > PREVIEW_BAND ? this.#large : this.#small;
  }

  #cached(band: ThumbnailBand, bandKey: string, draw: () => OffscreenCanvas): OffscreenCanvas {
    const cache = this.#cacheOf(band);
    const cached = cache.get(bandKey);

    if (cached !== undefined) {
      return cached;
    }

    const canvas = draw();
    cache.set(bandKey, canvas, thumbnailBytes(canvas));
    return canvas;
  }
}
