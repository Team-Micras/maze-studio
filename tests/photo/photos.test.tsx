/**
 * The recogniser against the owner's RCX photos in `fixtures/`, each labelled in `maze-label/1`
 * and held above a floor of score. Larger sets are scored by `bun run eval` (`scripts/eval.ts`).
 *
 * @module
 */

import { describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';

import { parseMazeText, type Maze } from '@/maze';
import { recogniseMaze, scoreRecognition, type Photo } from '@/photo';
import { cornersOf, readMazeLabel, type MazeLabel } from '@scripts/maze-label';

const LABELS: readonly MazeLabel[] = Object.entries(
  import.meta.glob<unknown>('./fixtures/*.json', { eager: true, import: 'default' })
).map(([file, value]) => {
  const read = readMazeLabel(value);

  if (!read.ok) {
    throw new Error(`${file}: ${read.error}`);
  }

  return read.value;
});

/**
 * The lowest score each photo of the repository may reach: one wrong edge of slack (0.9979) below
 * what each reaches now, one wrong edge and none.
 */
const FLOORS: Record<string, number> = {
  'rcx-2026-classic-2': 0.995,
  'rcx-2026-classic-day1-1': 0.997,
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

async function truthOf(label: MazeLabel): Promise<Maze> {
  const text = await commands.readFile(`vendor/mazefiles/${label.maze.file}`);
  const parsed = parseMazeText(text, label.maze.file);

  if (!parsed.ok) {
    throw new Error(`${label.maze.file}: ${parsed.error.message}`);
  }

  return parsed.value.maze;
}

describe('recognising the photos of the repository', () => {
  test('labels every photo of the fixtures', () => {
    expect(LABELS.map((label) => label.id).toSorted()).toEqual(Object.keys(FLOORS).toSorted());
  });

  test.each(LABELS)('$id', async (label) => {
    const photo = await decode(
      fromBase64(
        await commands.readFile(`tests/photo/fixtures/${label.image.file}`, { encoding: 'base64' })
      )
    );
    const corners = cornersOf(label, 'clicked');

    if (corners === undefined) {
      throw new Error(`${label.id} has no clicked corners`);
    }

    const { maze } = recogniseMaze(photo, { size: label.maze.size, corners });
    expect(scoreRecognition(maze, await truthOf(label))).toBeGreaterThanOrEqual(FLOORS[label.id]);
  });
});
