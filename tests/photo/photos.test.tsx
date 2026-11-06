/**
 * The recogniser against real photos: the owner's RCX photos in `fixtures/`, each held above a
 * floor of score, and, when `MAZE_PHOTOS` names the local set (`~/.cache/maze-photos`, with its
 * `annotations.json` and `frames/`), every annotated photo of it, scored in a table that
 * `--reporter=verbose` prints. Without the variable, as on CI, the local test is skipped.
 *
 * @module
 */

import { describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';

import { parseMazeText, type Maze } from '@/maze';
import { recogniseMaze, scoreRecognition, wrongEdges, type Photo, type Point } from '@/photo';

import fixtureFile from './fixtures/annotations.json';

/** A photo of the set: its file, the true maze's file in `vendor/mazefiles`, and its outline. */
interface Annotation {
  readonly file: string;
  readonly mazeFile: string;
  readonly size: number;
  readonly match?: 'confirmed' | 'likely';
  readonly corners: readonly (readonly number[])[];
}

const FIXTURES: readonly Annotation[] = fixtureFile;

/** The lowest score each photo of the repository may reach, just under what it reaches now. */
const FLOORS: Record<string, number> = {
  'rcx-2026-classic-2.jpg': 0.995,
  'rcx-2026-classic-day1-1.jpg': 0.995,
};

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

async function decode(bytes: Uint8Array<ArrayBuffer>): Promise<Photo> {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('no 2D context');
  }

  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function truthOf(annotation: Annotation): Promise<Maze> {
  const text = await commands.readFile(`vendor/mazefiles/${annotation.mazeFile}`);
  const parsed = parseMazeText(text, annotation.mazeFile);

  if (!parsed.ok) {
    throw new Error(`${annotation.mazeFile}: ${parsed.error.message}`);
  }

  return parsed.value.maze;
}

function outlineCorners(annotation: Annotation): [Point, Point, Point, Point] {
  const [a, b, c, d] = annotation.corners.map(([x, y]) => ({ x, y }));
  return [a, b, c, d];
}

async function recognise(annotation: Annotation, bytes: Uint8Array<ArrayBuffer>) {
  const photo = await decode(bytes);
  const truth = await truthOf(annotation);
  const started = performance.now();
  const { maze } = recogniseMaze(photo, {
    size: annotation.size,
    corners: outlineCorners(annotation),
  });
  return {
    score: scoreRecognition(maze, truth),
    wrong: wrongEdges(maze, truth).length,
    milliseconds: performance.now() - started,
  };
}

describe('recognising the photos of the repository', () => {
  test.each(FIXTURES)('$file', async (annotation) => {
    const bytes = fromBase64(
      await commands.readFile(`tests/photo/fixtures/${annotation.file}`, { encoding: 'base64' })
    );
    const { score } = await recognise(annotation, bytes);
    expect(score).toBeGreaterThanOrEqual(FLOORS[annotation.file]);
  });
});

const local = await commands.readMazePhoto('annotations.json');

describe.skipIf(local === null)('recognising the local set of MAZE_PHOTOS', () => {
  test('scores every annotated photo', async () => {
    const annotations: Annotation[] = JSON.parse(new TextDecoder().decode(fromBase64(local ?? '')));
    const rows: { match: string; line: string; score: number }[] = [];

    for (const annotation of annotations) {
      const bytes = await commands.readMazePhoto(`frames/${annotation.file}`);
      const result = await recognise(annotation, fromBase64(bytes ?? ''));
      rows.push({
        match: annotation.match ?? 'confirmed',
        line: [
          annotation.file.padEnd(40),
          (annotation.match ?? 'confirmed').padEnd(9),
          `${(result.score * 100).toFixed(1)} %`.padStart(8),
          String(result.wrong).padStart(4),
          `${Math.round(result.milliseconds)} ms`.padStart(8),
        ].join(' '),
        score: result.score,
      });
    }

    const average = (match: string) => {
      const scores = rows.filter((row) => row.match === match).map((row) => row.score);
      return scores.length === 0
        ? '—'
        : `${((scores.reduce((a, b) => a + b, 0) / scores.length) * 100).toFixed(2)} %`;
    };
    console.log(
      [
        ...rows.map((row) => row.line),
        `confirmed average ${average('confirmed')}, likely average ${average('likely')}`,
      ].join('\n')
    );
    expect(rows).toHaveLength(annotations.length);
  });
});
