import { describe, expect, test } from 'vitest';

import {
  Bits,
  clearStart,
  createMaze,
  horizontalEdgeCount,
  setStart,
  paintWalls,
  parseMazeText,
  profileOfPath,
  RULE_SEVERITIES,
  RULES,
  serializeMazeText,
  setGoals,
  setWall,
  validateMaze,
  verticalEdgeCount,
  type Edge,
  type Finding,
  type Maze,
  type MazeText,
  type Profile,
} from '@/maze';

function opened(text: string, fileName = 'classic/test.txt'): MazeText {
  const result = parseMazeText(text, fileName);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.value;
}

function corridor(): Edge[] {
  const edges: Edge[] = [];

  for (let y = 1; y <= 7; y++) {
    edges.push({ direction: 'horizontal', x: 0, y });
  }

  for (let x = 1; x <= 7; x++) {
    edges.push({ direction: 'vertical', x, y: 7 });
  }

  return edges;
}

function goalInterior(): Edge[] {
  return [
    { direction: 'horizontal', x: 7, y: 8 },
    { direction: 'horizontal', x: 8, y: 8 },
    { direction: 'vertical', x: 8, y: 7 },
    { direction: 'vertical', x: 8, y: 8 },
  ];
}

/**
 * A 16×16 maze that passes every rule: all walls up, then a corridor from the start up the west
 * column and east along row 7 into the goal, whose inside is open.
 */
function goodClassic(): Maze {
  const walled = createMaze({
    width: 16,
    height: 16,
    horizontal: Bits.from(horizontalEdgeCount(16, 16), () => true),
    vertical: Bits.from(verticalEdgeCount(16, 16), () => true),
    start: { x: 0, y: 0 },
    goals: [
      { x: 7, y: 7 },
      { x: 8, y: 7 },
      { x: 7, y: 8 },
      { x: 8, y: 8 },
    ],
  });
  return paintWalls(walled, [...corridor(), ...goalInterior()], false);
}

function findings(maze: Maze, profile: Profile = 'classic', fileName?: string): Finding[] {
  const source =
    fileName === undefined
      ? undefined
      : opened(serializeMazeText({ maze, trailer: '' }), fileName).source;
  return [...validateMaze({ maze, profile, source })];
}

function rules(found: readonly Finding[]): string[] {
  return found.map((finding) => `${finding.rule}:${finding.severity}`);
}

function only(found: readonly Finding[], rule: string): Finding {
  const matching = found.filter((finding) => finding.rule === rule);

  if (matching.length !== 1 || matching[0] === undefined) {
    throw new Error(`expected one ${rule} finding, got ${rules(found).join(', ')}`);
  }

  return matching[0];
}

function startFinding(document: MazeText): Finding {
  return only(validateMaze({ ...document, profile: 'free' }), 'single-start');
}

const GOOD = goodClassic();
const TWO_BY_TWO = ['o---o---o', '| G     |', 'o   o---o', '| S |   |', 'o---o---o', ''].join('\n');

describe('validation', () => {
  test('finds nothing in a good classic maze, read from a good file', () => {
    expect(findings(GOOD, 'classic', 'classic/good-1.txt')).toEqual([]);
  });

  test('gives each profile its own repository folder', () => {
    expect(profileOfPath('classic/a.txt')).toBe('classic');
    expect(profileOfPath('halfsize/a.txt')).toBe('halfsize');
    expect(profileOfPath('training/a.txt')).toBe('training');
    expect(profileOfPath('other/a.txt')).toBe('free');
    expect(profileOfPath('a.txt')).toBe('free');
  });

  test('holds each profile to the table of the plan, rule by rule', () => {
    const plan = [
      ['file-name', 'error', 'error', 'error', 'hint'],
      ['classic-size', 'error', undefined, 'error', undefined],
      ['homogeneous-grid', 'error', 'error', 'error', 'error'],
      ['no-carriage-return', 'error', 'error', 'error', 'warning'],
      ['final-newline', 'error', 'error', 'error', 'warning'],
      ['trailer-size', 'warning', 'warning', 'warning', 'warning'],
      ['closed-border', 'error', 'error', 'error', 'warning'],
      ['single-start', 'error', 'error', 'error', 'error'],
      ['start-corner', 'error', 'error', undefined, 'hint'],
      ['goal-area', 'error', 'error', undefined, 'warning'],
      ['classic-goal', 'error', undefined, undefined, undefined],
      ['loose-post', 'warning', 'warning', undefined, undefined],
      ['goal-reachable', 'warning', 'warning', 'warning', 'warning'],
      ['single-goal-entrance', 'warning', 'warning', undefined, undefined],
    ] as const;

    expect(RULE_SEVERITIES).toEqual(
      Object.fromEntries(
        plan.map(([rule, classic, halfsize, training, free]) => [
          rule,
          { classic, halfsize, training, free },
        ])
      )
    );
    expect(plan.map(([rule]) => rule)).toEqual([...RULES]);
  });

  test('lists findings in the order of the rules, frozen', () => {
    const found = validateMaze({ maze: createMaze({ width: 3, height: 2 }), profile: 'classic' });
    const order = found.map((finding) => RULES.indexOf(finding.rule));
    expect(order).toEqual(order.toSorted((left, right) => left - right));
    expect(Object.isFrozen(found)).toBe(true);
    expect(
      found.every(
        (finding) =>
          Object.isFrozen(finding) &&
          Object.isFrozen(finding.cells) &&
          Object.isFrozen(finding.edges) &&
          Object.isFrozen(finding.posts)
      )
    ).toBe(true);
  });

  describe('the rules about the file', () => {
    test('want a .txt name of letters, digits and "-", an error for the repository, a hint when free', () => {
      expect(rules(findings(GOOD, 'classic', 'classic/bad_name.txt'))).toEqual(['file-name:error']);
      expect(rules(findings(GOOD, 'classic', 'classic/good.TXT'))).toEqual(['file-name:error']);
      expect(rules(findings(GOOD, 'free', 'my maze.txt'))).toEqual(['file-name:hint']);
      expect(rules(findings(GOOD, 'classic', 'Japan-2019.txt'))).toEqual([]);
    });

    test('want a homogeneous grid, and point at the wall or cell that is not', () => {
      const text = TWO_BY_TWO.replace('o   o---o', 'o - o---o').replace('| G  ', '| X  ');
      const found = validateMaze({ ...opened(text, 'a.txt'), profile: 'free' });
      const grid = found.filter((finding) => finding.rule === 'homogeneous-grid');

      expect(grid.map((finding) => [finding.severity, finding.cells, finding.edges])).toEqual([
        ['error', [{ x: 0, y: 1 }], []],
        ['error', [], [{ direction: 'horizontal', x: 0, y: 1 }]],
      ]);
    });

    test('count a short or ragged line against the grid', () => {
      const short = opened('o---o---o\n|   |   |\no---o---o\n  S\no---o---o\n', 'a.txt');
      const ragged = opened(`${TWO_BY_TWO}o--\n`, 'a.txt');
      const shortFinding = only(validateMaze({ ...short, profile: 'free' }), 'homogeneous-grid');
      expect(shortFinding.cells).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      expect(shortFinding.edges).toEqual([{ direction: 'vertical', x: 2, y: 0 }]);
      expect(only(validateMaze({ ...ragged, profile: 'free' }), 'homogeneous-grid').edges).toEqual(
        []
      );
    });

    test('want line feeds only and a final one: errors for the repository, warnings when free', () => {
      const crlf = opened(TWO_BY_TWO.replaceAll('\n', '\r\n'), 'a.txt');
      const cut = opened(TWO_BY_TWO.slice(0, -1), 'a.txt');
      expect(
        only(validateMaze({ ...crlf, profile: 'halfsize' }), 'no-carriage-return').severity
      ).toBe('error');
      expect(only(validateMaze({ ...crlf, profile: 'free' }), 'no-carriage-return').severity).toBe(
        'warning'
      );
      expect(only(validateMaze({ ...cut, profile: 'training' }), 'final-newline').severity).toBe(
        'error'
      );
      expect(only(validateMaze({ ...cut, profile: 'free' }), 'final-newline').severity).toBe(
        'warning'
      );
    });

    test('warn about a trailer too long to share, as its own finding', () => {
      const long = opened(`${TWO_BY_TWO}${'é'.repeat(40_000)}\n`, 'a.txt');
      const found = validateMaze({ ...long, profile: 'free' });
      expect(only(found, 'trailer-size').severity).toBe('warning');
      expect(found.some((finding) => finding.rule === 'homogeneous-grid')).toBe(false);
    });

    test('only apply while the document has its source', () => {
      const crlf = opened(TWO_BY_TWO.replaceAll('\n', '\r\n'), 'bad name.md');
      const withSource = validateMaze({ ...crlf, profile: 'free' }).map((finding) => finding.rule);
      const without = validateMaze({ maze: crlf.maze, profile: 'free' }).map(
        (finding) => finding.rule
      );
      expect(withSource).toEqual(expect.arrayContaining(['file-name', 'no-carriage-return']));
      expect(without.filter((rule) => ['file-name', 'no-carriage-return'].includes(rule))).toEqual(
        []
      );
    });
  });

  describe('the rules about the maze', () => {
    test('want 16×16 for classic and training only', () => {
      const small = createMaze({ width: 8, height: 16 });
      expect(rules(findings(small, 'classic'))).toContain('classic-size:error');
      expect(rules(findings(small, 'training'))).toContain('classic-size:error');
      expect(
        rules(findings(small, 'halfsize')).some((rule) => rule.startsWith('classic-size'))
      ).toBe(false);
    });

    test('want a closed border, and point at each opening', () => {
      const open = setWall(
        setWall(GOOD, { direction: 'vertical', x: 16, y: 3 }, false),
        {
          direction: 'horizontal',
          x: 5,
          y: 16,
        },
        false
      );
      const finding = only(findings(open), 'closed-border');
      expect(finding.severity).toBe('error');
      expect(finding.edges).toEqual([
        { direction: 'horizontal', x: 5, y: 16 },
        { direction: 'vertical', x: 16, y: 3 },
      ]);
      expect(only(findings(open, 'free'), 'closed-border').severity).toBe('warning');
    });

    test('count every "S" of the file, wherever it is', () => {
      const extra = opened('o---o---o\n| S   S |\no---o---o\n', 'a.txt');
      const side = opened('o---o---o\n| S  S  |\no---o---o\n', 'a.txt');
      const inWall = opened('o---o---o\n| S S   |\no---o---o\n', 'a.txt');

      expect(startFinding(extra).cells).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      expect(startFinding(side).cells).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      expect(startFinding(inWall).cells).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      expect(startFinding(extra).severity).toBe('error');
      expect(startFinding(opened(`${TWO_BY_TWO}| S\n`, 'a.txt')).message).toMatch(/2 "S" marks/);
      expect(
        validateMaze({ maze: extra.maze, profile: 'free' }).some(
          (finding) => finding.rule === 'single-start'
        )
      ).toBe(false);
    });

    test('want the start in the south-west corner, walled west, east and south, open north', () => {
      expect(only(findings(setStart(GOOD, { x: 1, y: 0 })), 'start-corner').cells).toEqual([
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ]);
      expect(only(findings(clearStart(GOOD)), 'start-corner').message).toMatch(/no start/);

      const walls = paintWalls(
        setWall(GOOD, { direction: 'horizontal', x: 0, y: 1 }, true),
        [{ direction: 'vertical', x: 1, y: 0 }],
        false
      );
      expect(only(findings(walls), 'start-corner').edges).toEqual([
        { direction: 'vertical', x: 1, y: 0 },
        { direction: 'horizontal', x: 0, y: 1 },
      ]);
      expect(rules(findings(setStart(GOOD, { x: 1, y: 0 }), 'free'))).toContain(
        'start-corner:hint'
      );
      expect(rules(findings(setStart(GOOD, { x: 1, y: 0 }), 'training'))).not.toContain(
        'start-corner:error'
      );
    });

    test('want no open north side of the start in a maze one cell tall, where it is the border', () => {
      const flat = createMaze({
        width: 3,
        height: 1,
        horizontal: Bits.from(6, () => true),
        vertical: Bits.from(4, (index) => index !== 2),
        start: { x: 0, y: 0 },
        goals: [{ x: 2, y: 0 }],
      });
      expect(
        findings(flat, 'halfsize').filter((finding) => finding.rule === 'start-corner')
      ).toEqual([]);
    });

    test('want goal cells that form a rectangle with no wall inside', () => {
      expect(only(findings(setGoals(GOOD, [])), 'goal-area').message).toMatch(/no goal/);

      const shaped = setGoals(GOOD, [
        { x: 7, y: 7 },
        { x: 8, y: 7 },
        { x: 7, y: 8 },
      ]);
      expect(only(findings(shaped, 'halfsize'), 'goal-area').cells).toEqual([{ x: 8, y: 8 }]);

      const walled = setWall(GOOD, { direction: 'vertical', x: 8, y: 8 }, true);
      expect(only(findings(walled), 'goal-area').edges).toEqual([
        { direction: 'vertical', x: 8, y: 8 },
      ]);
      expect(only(findings(walled, 'free'), 'goal-area').severity).toBe('warning');
    });

    test('read an asymmetric goal by x and y, not y and x', () => {
      const wide = paintWalls(
        setGoals(GOOD, [
          { x: 7, y: 7 },
          { x: 8, y: 7 },
          { x: 9, y: 7 },
          { x: 7, y: 8 },
          { x: 8, y: 8 },
          { x: 9, y: 8 },
        ]),
        [
          { direction: 'vertical', x: 9, y: 7 },
          { direction: 'vertical', x: 9, y: 8 },
          { direction: 'horizontal', x: 9, y: 8 },
        ],
        false
      );
      expect(findings(wide, 'halfsize')).toEqual([]);

      const walled = setWall(wide, { direction: 'horizontal', x: 9, y: 8 }, true);
      expect(only(findings(walled, 'halfsize'), 'goal-area').edges).toEqual([
        { direction: 'horizontal', x: 9, y: 8 },
      ]);
    });

    test('want the classic goal in the middle, for classic only', () => {
      const moved = setGoals(GOOD, [{ x: 0, y: 15 }]);
      expect(only(findings(moved), 'classic-goal').cells).toEqual([
        { x: 7, y: 7 },
        { x: 8, y: 7 },
        { x: 7, y: 8 },
        { x: 8, y: 8 },
        { x: 0, y: 15 },
      ]);
      expect(
        rules(findings(moved, 'halfsize')).some((rule) => rule.startsWith('classic-goal'))
      ).toBe(false);
    });
  });

  describe('the proof rules', () => {
    test('warn about posts no wall touches, but not the middle of the goal', () => {
      const loose = paintWalls(
        GOOD,
        [
          { direction: 'horizontal', x: 3, y: 3 },
          { direction: 'horizontal', x: 2, y: 3 },
          { direction: 'vertical', x: 3, y: 3 },
          { direction: 'vertical', x: 3, y: 2 },
        ],
        false
      );
      const finding = only(findings(loose), 'loose-post');
      expect(finding.severity).toBe('warning');
      expect(finding.posts).toEqual([{ x: 3, y: 3 }]);
      expect(rules(findings(loose, 'training')).some((rule) => rule.startsWith('loose-post'))).toBe(
        false
      );
    });

    test('warn when no goal can be reached from the start, and say nothing without a start', () => {
      const cut = setWall(GOOD, { direction: 'horizontal', x: 0, y: 4 }, true);
      expect(only(findings(cut), 'goal-reachable').cells[0]).toEqual({ x: 0, y: 0 });
      expect(only(findings(cut, 'training'), 'goal-reachable').severity).toBe('warning');
      expect(
        rules(findings(clearStart(cut))).some((rule) => rule.startsWith('goal-reachable'))
      ).toBe(false);
    });

    test('warn about a goal area with more than one entrance, or none', () => {
      const second = setWall(GOOD, { direction: 'horizontal', x: 8, y: 9 }, false);
      expect(only(findings(second), 'single-goal-entrance').edges).toEqual([
        { direction: 'vertical', x: 7, y: 7 },
        { direction: 'horizontal', x: 8, y: 9 },
      ]);

      const closed = setWall(GOOD, { direction: 'vertical', x: 7, y: 7 }, true);
      expect(only(findings(closed), 'single-goal-entrance').message).toMatch(/no entrance/);
    });
  });
});
