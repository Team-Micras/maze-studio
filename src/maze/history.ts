/**
 * Undo and redo over immutable values, with a bounded number of steps and gestures: everything a
 * gesture changes, such as a whole drag, is one step.
 *
 * @module
 */

/** How many steps can be undone. */
export const HISTORY_LIMIT = 500;

/** The values before and after the present one, and the gesture in progress, if any. */
/** A history of values, which are objects so that no value is mistaken for a missing one. */
export interface History<T extends object> {
  /** The values that undo goes back to, oldest first, at most `limit` of them. */
  readonly past: readonly T[];
  /** The value now. */
  readonly present: T;
  /** The values that redo goes forward to, nearest first. */
  readonly future: readonly T[];
  /** How many steps `past` keeps. */
  readonly limit: number;
  /** While a gesture is in progress, the value from before it. */
  readonly gestureBase?: T;
  /** Whether two values are the same, so that a change to an equal value is no step. */
  readonly equals: (left: T, right: T) => boolean;
}

/** How a history counts its steps and tells two values apart. */
export interface HistoryOptions<T extends object> {
  /** How many steps can be undone; {@link HISTORY_LIMIT} unless given. */
  readonly limit?: number;
  /** Whether two values are the same; identity unless given. */
  readonly equals?: (left: T, right: T) => boolean;
}

/**
 * A history with `present` and nothing to undo or redo.
 *
 * @throws {RangeError} When `limit` is not a positive integer.
 */
export function createHistory<T extends object>(
  present: T,
  options: HistoryOptions<T> = {}
): History<T> {
  const limit = options.limit ?? HISTORY_LIMIT;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`a history keeps a positive whole number of steps, not ${limit}`);
  }

  return Object.freeze({
    past: [],
    present,
    future: [],
    limit,
    equals: options.equals ?? Object.is,
  });
}

function step<T extends object>(history: History<T>, from: T, to: T): History<T> {
  return Object.freeze({
    past: [...history.past, from].slice(-history.limit),
    present: to,
    future: [],
    limit: history.limit,
    equals: history.equals,
  });
}

/** Whether a gesture is in progress. */
export function inGesture<T extends object>(history: History<T>): boolean {
  return history.gestureBase !== undefined;
}

/**
 * Makes `next` the present. Outside a gesture this is one step, and clears what redo would bring
 * back; inside one it only changes the present, and the gesture's end makes the step. A value
 * equal to the present changes nothing.
 */
export function record<T extends object>(history: History<T>, next: T): History<T> {
  if (history.equals(history.present, next)) {
    return history;
  }

  return inGesture(history)
    ? Object.freeze({ ...history, present: next })
    : step(history, history.present, next);
}

/** Starts a gesture: the changes recorded until {@link endGesture} make one step. */
export function beginGesture<T extends object>(history: History<T>): History<T> {
  return inGesture(history) ? history : Object.freeze({ ...history, gestureBase: history.present });
}

/**
 * Ends the gesture in progress: one step from the value before it to the present, or none when
 * the present is back to that value. Without a gesture in progress, nothing changes.
 */
export function endGesture<T extends object>(history: History<T>): History<T> {
  if (!inGesture(history)) {
    return history;
  }

  const { gestureBase, ...rest } = history;
  const ended: History<T> = Object.freeze(rest);

  if (gestureBase === undefined || history.equals(gestureBase, history.present)) {
    return Object.freeze({ ...ended, present: gestureBase ?? history.present });
  }

  return step(ended, gestureBase, history.present);
}

/** Whether there is a step to undo, counting a gesture in progress. */
export function canUndo<T extends object>(history: History<T>): boolean {
  return history.past.length > 0 || inGesture(history);
}

/** Whether there is a step to redo. */
export function canRedo<T extends object>(history: History<T>): boolean {
  return !inGesture(history) && history.future.length > 0;
}

/** Goes back one step, ending a gesture in progress first; nothing changes when there is none. */
export function undo<T extends object>(history: History<T>): History<T> {
  const ended = endGesture(history);
  const previous = ended.past.at(-1);

  if (previous === undefined) {
    return ended;
  }

  return Object.freeze({
    ...ended,
    past: ended.past.slice(0, -1),
    present: previous,
    future: [ended.present, ...ended.future],
  });
}

/** Goes forward one undone step, ending a gesture in progress first; nothing changes when there is none. */
export function redo<T extends object>(history: History<T>): History<T> {
  const ended = endGesture(history);
  const [next, ...future] = ended.future;

  if (next === undefined) {
    return ended;
  }

  return Object.freeze({
    ...ended,
    past: [...ended.past, ended.present],
    present: next,
    future,
  });
}
