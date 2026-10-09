import type { CatalogEntry } from '@/library';

/** What a screen reader says for an artboard: `japan2011hef, Japan, 32 by 32` (DESIGN.md 13). */
export function artboardLabel(entry: CatalogEntry): string {
  const size = `${entry.width} by ${entry.height}`;
  return entry.competition === undefined
    ? `${entry.name}, ${size}`
    : `${entry.name}, ${entry.competition}, ${size}`;
}
