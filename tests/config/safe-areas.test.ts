import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, test } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const UI = join(ROOT, 'src', 'ui');

/** An offset from an edge of the viewport by a number or a length, not a fraction of it. */
const EDGE_OFFSET = /^(?:[^\s:]+:)*(top|left|right|bottom)-(\d+(\.\d+)?|\[[^\]]+\])$/;

/** The quoted strings of a source file that hold `fixed` among their classes. */
function fixedClassLists(source: string): string[] {
  return [...source.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)]
    .map((match) => match[2] ?? '')
    .filter((text) => /(^|\s)fixed(\s|$)/.test(text));
}

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** The edge offsets of `fixed` elements in `source` that leave out the safe-area inset. */
function unsafeOffsets(source: string): string[] {
  return fixedClassLists(source).flatMap((classes) =>
    classes.split(/\s+/).filter((token) => EDGE_OFFSET.test(token) && !token.includes('safe-area'))
  );
}

describe('islands and the safe area (DESIGN.md 5)', () => {
  test('the check catches an edge offset without the inset, and passes centred or safe ones', () => {
    expect(unsafeOffsets('<p className="fixed top-4 left-safe-4 bottom-[18px]" />')).toEqual([
      'top-4',
      'bottom-[18px]',
    ]);
    expect(unsafeOffsets('<p className="fixed top-1/2 left-1/2 right-safe-[72px]" />')).toEqual([]);
    expect(unsafeOffsets("cn('fixed max-[720px]:top-2', other)")).toEqual(['max-[720px]:top-2']);
    expect(unsafeOffsets('<p className="absolute top-4" />')).toEqual([]);
  });

  test('no fixed element of the app outside the primitives sits by an edge without its inset', () => {
    const found = sources(UI)
      .filter((file) => !file.includes(join('src', 'ui', 'primitives')))
      .flatMap((file) =>
        unsafeOffsets(readFileSync(file, 'utf8')).map(
          (token) => `${relative(ROOT, file)}: ${token}`
        )
      );

    expect(found).toEqual([]);
  });
});
