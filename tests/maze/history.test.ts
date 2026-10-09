import { describe, expect, test } from 'vitest';

import {
  beginGesture,
  canRedo,
  canUndo,
  clearArea,
  clearStart,
  createHistory,
  endGesture,
  fillBorder,
  HISTORY_LIMIT,
  inGesture,
  mazesEqual,
  setStart,
  paintWalls,
  parseMazeText,
  record,
  redo,
  serializeMazeText,
  setGoals,
  toggleGoal,
  toggleWall,
  undo,
  wallRectangle,
  type Cell,
  type Edge,
  type History,
  type Maze,
} from '@/maze';
import { between, randomMaze, seededRandom, type Random } from '@tests/support/maze/random-maze';

interface Value {
  readonly n: number;
}

function value(n: number): Value {
  return { n };
}

function sameN(left: Value, right: Value): boolean {
  return left.n === right.n;
}

function recordAll(history: History<Value>, values: readonly number[]): History<Value> {
  return values.reduce((current, n) => record(current, value(n)), history);
}

function present(history: History<Value>): number {
  return history.present.n;
}

describe('the history', () => {
  test('undoes and redoes one step at a time', () => {
    let history = recordAll(createHistory(value(0)), [1, 2, 3]);
    expect([canUndo(history), canRedo(history)]).toEqual([true, false]);

    history = undo(undo(history));
    expect(present(history)).toBe(1);
    expect(canRedo(history)).toBe(true);

    history = redo(history);
    expect(present(history)).toBe(2);
    expect(present(undo(undo(undo(undo(history)))))).toBe(0);
    expect(present(redo(redo(redo(history))))).toBe(3);
  });

  test('drops what redo would bring back when a new step is recorded', () => {
    const history = record(undo(undo(recordAll(createHistory(value(0)), [1, 2, 3]))), value(9));
    expect(present(history)).toBe(9);
    expect(canRedo(history)).toBe(false);
    expect(present(undo(history))).toBe(1);
  });

  test('records no step for a value equal to the present', () => {
    const start = value(0);
    const history = createHistory(start, { equals: sameN });
    expect(record(history, value(0))).toBe(history);
    expect(record(createHistory(start), start).past).toEqual([]);
    expect(record(createHistory(start), value(0)).past).toEqual([start]);
  });

  test(`keeps the last ${HISTORY_LIMIT} steps and forgets older ones`, () => {
    const history = recordAll(
      createHistory(value(0)),
      Array.from({ length: 600 }, (_, index) => index + 1)
    );
    expect(history.past).toHaveLength(HISTORY_LIMIT);

    let undone = history;
    while (canUndo(undone)) {
      undone = undo(undone);
    }

    expect(present(undone)).toBe(100);
    expect(undone.future).toHaveLength(HISTORY_LIMIT);
    expect(present(recordAll(createHistory(value(0), { limit: 2 }), [1, 2, 3]))).toBe(3);
    expect(
      present(undo(undo(undo(recordAll(createHistory(value(0), { limit: 2 }), [1, 2, 3])))))
    ).toBe(1);
  });

  test('never holds more steps than the limit, undone ones included', () => {
    const random = seededRandom(7);
    let history = createHistory(value(0), { limit: 5 });

    for (let move = 0; move < 400; move++) {
      const choice = random();
      history =
        choice < 0.5
          ? record(history, value(move + 1))
          : choice < 0.8
            ? undo(history)
            : redo(history);
      expect(history.past.length + history.future.length).toBeLessThanOrEqual(5);
    }
  });

  test('refuses a limit that is not a positive whole number', () => {
    expect(() => createHistory(value(0), { limit: 0 })).toThrow(RangeError);
    expect(() => createHistory(value(0), { limit: 2.5 })).toThrow(RangeError);
  });

  test('makes one step of everything a gesture records', () => {
    const base = recordAll(createHistory(value(0)), [1]);
    let history = beginGesture(base);
    expect(inGesture(history)).toBe(true);
    expect(beginGesture(history)).toBe(history);

    history = recordAll(history, [2, 3, 4]);
    expect(present(history)).toBe(4);
    expect(history.past).toEqual(base.past);

    history = endGesture(history);
    expect(inGesture(history)).toBe(false);
    expect(history.past.map((past) => past.n)).toEqual([0, 1]);
    expect(present(undo(history))).toBe(1);
    expect(present(redo(undo(history)))).toBe(4);
  });

  test('makes no step of a gesture that ends where it began, and keeps what redo brings back', () => {
    const before = undo(recordAll(createHistory(value(0), { equals: sameN }), [1, 2]));
    const gesture = recordAll(beginGesture(before), [5, 1]);
    const ended = endGesture(gesture);

    expect(ended.past).toEqual(before.past);
    expect(ended.present).toBe(before.present);
    expect(ended.future).toEqual(before.future);
    expect(endGesture(ended)).toBe(ended);
  });

  test('drops what redo would bring back only when a gesture changes something', () => {
    const before = undo(recordAll(createHistory(value(0)), [1, 2]));
    expect(canRedo(before)).toBe(true);
    expect(canRedo(beginGesture(before))).toBe(false);
    expect(canRedo(endGesture(record(beginGesture(before), value(7))))).toBe(false);
  });

  test('ends a gesture in progress before undo or redo', () => {
    const gesture = recordAll(beginGesture(createHistory(value(0))), [1, 2]);
    expect(canUndo(gesture)).toBe(true);

    const undone = undo(gesture);
    expect(inGesture(undone)).toBe(false);
    expect(present(undone)).toBe(0);
    expect(present(redo(undone))).toBe(2);
    expect(present(redo(recordAll(beginGesture(createHistory(value(0))), [3])))).toBe(3);
  });

  test('ends a gesture in progress on redo too', () => {
    const redone = redo(recordAll(beginGesture(createHistory(value(0))), [3]));
    expect(inGesture(redone)).toBe(false);
    expect(present(redone)).toBe(3);
    expect(canUndo(redone)).toBe(true);
  });

  test('redoes through a gesture that changed nothing', () => {
    const before = undo(undo(recordAll(createHistory(value(0), { equals: sameN }), [1, 2])));
    const gesture = recordAll(beginGesture(before), [8, 0]);
    expect(canRedo(gesture)).toBe(false);

    const redone = redo(gesture);
    expect(inGesture(redone)).toBe(false);
    expect(present(redone)).toBe(1);
    expect(present(redo(redone))).toBe(2);
  });

  test('has nothing to undo in a gesture that changed nothing, with no past', () => {
    const fresh = createHistory(value(0), { equals: sameN });
    expect(canUndo(beginGesture(fresh))).toBe(false);
    expect(canUndo(record(beginGesture(fresh), value(1)))).toBe(true);
    expect(canUndo(recordAll(beginGesture(fresh), [1, 0]))).toBe(false);
  });

  test('gives back frozen histories', () => {
    const history = record(createHistory(value(0)), value(1));
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(beginGesture(history))).toBe(true);
    expect(Object.isFrozen(undo(history))).toBe(true);
    expect(Object.isFrozen(history.past)).toBe(true);
    expect(Object.isFrozen(undo(history).future)).toBe(true);
    expect(Object.isFrozen(redo(undo(history)).future)).toBe(true);
    expect(Object.isFrozen(createHistory(value(0)).past)).toBe(true);
  });
});

function randomCell(random: Random, maze: Maze): Cell {
  return { x: between(random, 0, maze.width - 1), y: between(random, 0, maze.height - 1) };
}

function randomEdge(random: Random, maze: Maze): Edge {
  return random() < 0.5
    ? {
        direction: 'horizontal',
        x: between(random, 0, maze.width - 1),
        y: between(random, 0, maze.height),
      }
    : {
        direction: 'vertical',
        x: between(random, 0, maze.width),
        y: between(random, 0, maze.height - 1),
      };
}

function randomEdit(random: Random, maze: Maze): Maze {
  const area = { from: randomCell(random, maze), to: randomCell(random, maze) };

  switch (between(random, 0, 7)) {
    case 0:
      return toggleWall(maze, randomEdge(random, maze));
    case 1:
      return paintWalls(
        maze,
        Array.from({ length: between(random, 1, 12) }, () => randomEdge(random, maze)),
        random() < 0.5
      );
    case 2:
      return wallRectangle(maze, area);
    case 3:
      return clearArea(maze, area);
    case 4:
      return fillBorder(maze);
    case 5:
      return random() < 0.9 ? setStart(maze, randomCell(random, maze)) : clearStart(maze);
    case 6:
      return setGoals(
        maze,
        Array.from({ length: between(random, 0, 4) }, () => randomCell(random, maze))
      );
    default:
      return toggleGoal(maze, randomCell(random, maze));
  }
}

describe('editing a maze with the history', () => {
  test('undoing everything gives back the original file byte for byte, and redoing the result', () => {
    const random = seededRandom(0x1b);
    const original = randomMaze(random, { width: 16, height: 16 });
    const text = serializeMazeText({ maze: original, trailer: '' });
    const opened = parseMazeText(text, 'original.txt');

    if (!opened.ok) {
      throw new Error(opened.error.message);
    }

    let history = createHistory(opened.value.maze, { equals: mazesEqual });
    for (let edit = 0; edit < 300; edit++) {
      if (random() < 0.3) {
        history = beginGesture(history);
        for (let stroke = between(random, 1, 6); stroke > 0; stroke--) {
          history = record(history, randomEdit(random, history.present));
        }
        history = endGesture(history);
      } else {
        history = record(history, randomEdit(random, history.present));
      }
    }

    const edited = history.present;
    expect(history.past.length).toBeGreaterThan(200);
    expect(mazesEqual(edited, original)).toBe(false);

    while (canUndo(history)) {
      history = undo(history);
    }

    expect(history.present).toBe(opened.value.maze);
    expect(serializeMazeText({ maze: history.present, trailer: '' })).toBe(text);

    while (canRedo(history)) {
      history = redo(history);
    }

    expect(history.present).toBe(edited);
  });
});
