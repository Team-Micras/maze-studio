/**
 * The colours of the track and of what the editor draws on it (DESIGN.md 2.2 and 2.3). The track
 * looks the same in the light and the dark theme, so these are values, not theme tokens; the SVG
 * board and the canvas thumbnails both paint with them.
 *
 * @module
 */

/** The track palette. */
export const TRACK_COLORS = {
  /** Cell floor. */
  floor: 'oklch(0.17 0 0)',
  /** Every place a wall can go, under the walls. */
  rail: 'oklch(0.24 0 0)',
  /** Top of a wall away from the start and the goals. */
  wall: 'oklch(0.57 0.2 27)',
  /** Top of a post away from the start and the goals. */
  post: 'oklch(0.64 0.21 27)',
  /** Walls and posts touching the start or a goal, and the start chevron. */
  bare: 'oklch(0.93 0 0)',
  /** Goal floor tint, painted at {@link TRACK_OPACITY.goal}. */
  goal: 'oklch(0.72 0.12 170)',
  /** What the selected finding points at. */
  focus: 'oklch(0.84 0.15 84)',
  /** Keyboard cursor, selection and the outline of the edge preview. */
  cursor: 'oklch(0.985 0 0)',
  /** What changed in the session. */
  diff: 'oklch(0.74 0.15 235)',
} as const;

/** The opacities the palette is painted at where it is not opaque. */
export const TRACK_OPACITY = {
  goal: 0.14,
  start: 0.9,
  diffFill: 0.22,
  focusFill: 0.16,
  selectionFill: 0.07,
  previewFill: 0.5,
  previewOutline: 0.6,
} as const;
