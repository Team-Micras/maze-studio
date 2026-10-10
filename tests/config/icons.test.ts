import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { ICONS, ICONS_MODULE, iconsModule } from '@scripts/icons';

describe('The icons module', () => {
  test('is what scripts/icons.ts writes, so it is never edited by hand', () => {
    expect(readFileSync(ICONS_MODULE, 'utf8')).toBe(iconsModule());
  });

  test('has one component for each icon the script lists, and only those', () => {
    const exported = [
      ...readFileSync(ICONS_MODULE, 'utf8').matchAll(/export function (\w+)\(props: IconProps\)/g),
    ].map((match) => match[1]);

    expect(exported).toEqual(ICONS);
  });
});
