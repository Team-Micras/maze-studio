/**
 * Scores the recogniser on a folder of `maze-label/1` files: `bun run eval <folder> [--split
 * <name>] [--out <file>]`. Each photo is decoded by Chromium's `createImageBitmap`, through
 * Playwright, as the app decodes it; `recogniseMaze` reads it from three sets of corners, scored
 * against the label's maze file in `vendor/mazefiles`:
 *
 * - `oracle`, when the label has them;
 * - `clicked`: the label's clicked corners, else its lens-fit ones, else its projected ones;
 * - `clicked ±1 %`: those moved at random by up to 1 % of the side, once per seed.
 *
 * An optional `index.json` in the folder gives each frame's `split` and `event` (the event
 * defaults to the maze file) and the `lockedEvents`, a test subset reported apart and never tuned
 * on: `{ "lockedEvents": { "seed": 1, "events": [...] }, "frames": { "<id>": { "split": "heldout",
 * "event": "..." } } }`.
 *
 * It prints, per corner set and group, the share of frames with no wrong edge (the headline), its
 * range with one event left out and its 90 % bootstrap interval over events, the mean score and
 * the wrong edges; and writes all of it with every frame's wrong edges, their confidence and the
 * rules they break to `results.json` in the folder, or to `--out`.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { hasWall, parseMazeText, type Edge, type Maze } from '@/maze';
import { recogniseMaze, wrongEdges, type Photo, type Point, type Recognition } from '@/photo';

import {
  edgeConfidence,
  edgeRules,
  JITTER,
  JITTER_SEEDS,
  jitterCorners,
  summarise,
  type ScoredFrame,
} from './evaluation';
import { cornersOf, readMazeLabel, type MazeLabel } from './maze-label';

const ROOT = join(import.meta.dirname, '..');
const MAZEFILES = join(ROOT, 'vendor', 'mazefiles');
const NOT_LABELS = new Set(['index.json', 'results.json']);
const USER_SOURCES = ['clicked', 'lensfit', 'projected'] as const;

interface IndexFile {
  readonly lockedEvents?: { readonly seed: number; readonly events: readonly string[] };
  readonly frames?: Readonly<Record<string, { readonly split?: string; readonly event?: string }>>;
}

interface Run {
  readonly score: number;
  readonly wrong: number;
  readonly milliseconds: number;
  readonly error?: string;
  readonly wrongEdges?: readonly (Edge & {
    truth: boolean;
    confidence: number;
    rules: readonly string[];
  })[];
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { split: { type: 'string' }, out: { type: 'string' } },
});

if (positionals.length !== 1) {
  throw new Error('usage: bun run eval <label folder> [--split <name>] [--out <file>]');
}

const folder = resolve(positionals[0]);
const files = readdirSync(folder)
  .filter((file) => file.endsWith('.json') && !NOT_LABELS.has(file))
  .toSorted();
const indexText = tryRead(join(folder, 'index.json'));
const index: IndexFile = indexText === undefined ? {} : JSON.parse(indexText);
const locked = new Set(index.lockedEvents?.events ?? []);
const labelSet = createHash('sha256');

for (const file of files) {
  labelSet.update(`${file}\0${readFileSync(join(folder, file), 'utf8')}\0`);
}

labelSet.update(indexText ?? '');

function tryRead(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function labelOf(file: string): MazeLabel {
  const read = readMazeLabel(JSON.parse(readFileSync(join(folder, file), 'utf8')));

  if (!read.ok) {
    throw new Error(`${file}: ${read.error}`);
  }

  return read.value;
}

function truthOf(label: MazeLabel): Maze {
  const parsed = parseMazeText(
    readFileSync(join(MAZEFILES, label.maze.file), 'utf8'),
    label.maze.file
  );

  if (!parsed.ok) {
    throw new Error(`${label.maze.file}: ${parsed.error.message}`);
  }

  return parsed.value.maze;
}

const labels = files
  .map(labelOf)
  .filter(
    (label) => values.split === undefined || index.frames?.[label.id]?.split === values.split
  );
if (labels.length === 0) {
  throw new Error(
    `no label in ${folder}${values.split === undefined ? '' : ` of split ${values.split}`}`
  );
}

const browser = await chromium.launch();
const page = await browser.newPage();
const decoder = `Chromium ${browser.version()} createImageBitmap`;
const recogniser = execFileSync('git', ['describe', '--always', '--dirty'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();

async function decode(label: MazeLabel): Promise<Photo> {
  const bytes = readFileSync(join(folder, label.image.file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  if (sha256 !== label.image.sha256) {
    throw new Error(`${label.id}: ${label.image.file} has sha256 ${sha256}, not the label's`);
  }

  const [width, height, data] = await page.evaluate(async (base64: string) => {
    const bitmap = await createImageBitmap(
      new Blob([Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))])
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');

    if (context === null) {
      throw new Error('no 2D context');
    }

    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let binary = '';

    for (let start = 0; start < pixels.length; start += 0x8000) {
      binary += String.fromCharCode(...pixels.subarray(start, start + 0x8000));
    }

    return [bitmap.width, bitmap.height, btoa(binary)] as const;
  }, bytes.toString('base64'));

  if (width !== label.image.width || height !== label.image.height) {
    throw new Error(`${label.id}: the image is ${width}×${height}, not the label's size`);
  }

  return { width, height, data: new Uint8Array(Buffer.from(data, 'base64')) };
}

function run(
  photo: Photo,
  truth: Maze,
  size: number,
  corners: readonly [Point, Point, Point, Point],
  detailed: boolean
): Run {
  const internal = 2 * size * (size - 1);
  const started = performance.now();
  let recognition: Recognition;

  try {
    recognition = recogniseMaze(photo, {
      size,
      corners,
      ...(truth.start !== undefined && { start: truth.start }),
      goals: truth.goals,
    });
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }

    return { score: 0, wrong: internal, milliseconds: 0, error: error.message };
  }

  const milliseconds = performance.now() - started;
  const wrong = wrongEdges(recognition.maze, truth);

  return {
    score: 1 - wrong.length / internal,
    wrong: wrong.length,
    milliseconds: Math.round(milliseconds),
    ...(detailed && {
      wrongEdges: wrong.map((edge) => ({
        direction: edge.direction,
        x: edge.x,
        y: edge.y,
        truth: hasWall(truth, edge),
        confidence: Number(edgeConfidence(recognition, edge).toFixed(3)),
        rules: edgeRules(recognition, edge),
      })),
    }),
  };
}

interface Frame {
  readonly id: string;
  readonly event: string;
  readonly locked: boolean;
  /** The groups the frame is summarised in: its split, open or locked, distortion and size. */
  readonly groups: readonly string[];
  readonly clickedSource: string | null;
  readonly oracle: Run | null;
  readonly clicked: Run | null;
  readonly jitter: readonly (Run & { readonly seed: number })[];
}

const frames: Frame[] = [];

try {
  for (const label of labels) {
    const photo = await decode(label);
    const truth = truthOf(label);
    const { size } = label.maze;
    const oracle = cornersOf(label, 'oracle');
    const source = USER_SOURCES.find((name) => cornersOf(label, name) !== undefined);
    const clicked = source === undefined ? undefined : cornersOf(label, source);
    const split = index.frames?.[label.id]?.split ?? 'all';
    const event = index.frames?.[label.id]?.event ?? label.maze.file;
    const frame: Frame = {
      id: label.id,
      event,
      locked: locked.has(event),
      groups: [
        split,
        ...(locked.size > 0 ? [`${split}, ${locked.has(event) ? 'locked' : 'open'}`] : []),
        `${split}, distortion ${String(label.factors?.distortion ?? 'unknown')}`,
        `${split}, ${size}×${size}`,
      ],
      clickedSource: source ?? null,
      oracle: oracle === undefined ? null : run(photo, truth, size, oracle, true),
      clicked: clicked === undefined ? null : run(photo, truth, size, clicked, true),
      jitter:
        clicked === undefined
          ? []
          : JITTER_SEEDS.map((seed) =>
              Object.assign(run(photo, truth, size, jitterCorners(clicked, seed), false), { seed })
            ),
    };
    frames.push(frame);
    console.error(
      `${label.id.padEnd(40)} oracle ${frame.oracle?.wrong ?? '-'}, clicked ${frame.clicked?.wrong ?? '-'}, ±1 % ${frame.jitter.map((entry) => entry.wrong).join('/') || '-'}`
    );
  }
} finally {
  await browser.close();
}

const conditions: readonly [string, (frame: Frame) => readonly Run[]][] = [
  ['oracle', (frame) => (frame.oracle === null ? [] : [frame.oracle])],
  ['clicked', (frame) => (frame.clicked === null ? [] : [frame.clicked])],
  [`clicked ±${JITTER * 100} %`, (frame) => frame.jitter],
];
const groups = [...new Set(frames.flatMap((frame) => frame.groups))].toSorted((a, b) =>
  a.localeCompare(b)
);
const summary = conditions.flatMap(([condition, runs]) =>
  groups.flatMap((group) => {
    const scored: ScoredFrame[] = frames
      .filter((frame) => frame.groups.includes(group))
      .flatMap((frame) =>
        runs(frame).map((entry) => ({ event: frame.event, score: entry.score, wrong: entry.wrong }))
      );
    return scored.length === 0 ? [] : [Object.assign({ condition, group }, summarise(scored))];
  })
);
const percent = (value: number) => `${(value * 100).toFixed(1)} %`;

console.log(
  [
    `recogniser ${recogniser}, ${decoder}, label set ${labelSet.copy().digest('hex').slice(0, 12)}`,
    '',
    '| corners | group | frames | zero-error | one event out | 90 % over events | mean score | wrong edges |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summary.map((row) =>
      [
        '',
        row.condition,
        row.group,
        `${row.frames} (${row.events} events)`,
        percent(row.zeroErrorRate),
        row.leaveOneEventOut === null ? '—' : row.leaveOneEventOut.map(percent).join('–'),
        row.bootstrap90.map(percent).join('–'),
        `${(row.meanScore * 100).toFixed(2)} %`,
        row.wrongEdges,
        '',
      ]
        .join(' | ')
        .trim()
    ),
  ].join('\n')
);

writeFileSync(
  values.out ?? join(folder, 'results.json'),
  `${JSON.stringify(
    {
      recogniser,
      decoder,
      labels: folder,
      labelSet: labelSet.digest('hex'),
      split: values.split ?? null,
      jitter: { share: JITTER, seeds: JITTER_SEEDS },
      lockedEvents: index.lockedEvents ?? null,
      summary,
      frames,
    },
    null,
    1
  )}\n`
);
