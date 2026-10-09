/**
 * The search of DESIGN.md 6.3, one index for the library and the quick list: each maze is indexed
 * by its name, competition, year and size, the size in three spellings (`32`, `32x32`, `32×32`).
 * The query is split on spaces and every token must match the start of a word of the index,
 * without regard to case, so `japan 2011` finds `japan2011hef` and nothing from other years.
 *
 * @module
 */

import type { CatalogEntry } from './catalog';

/** The words a maze is found by, lower case. */
export type SearchWords = readonly string[];

const SEPARATORS = /[^\p{L}\p{N}×]+/u;
const LETTERS_AND_DIGITS = /\p{L}+|\p{N}+/gu;

function wordsOf(text: string): string[] {
  const lower = text.toLowerCase();
  const pieces = lower.split(SEPARATORS).filter((piece) => piece !== '');
  return [lower, ...pieces, ...pieces.flatMap((piece) => piece.match(LETTERS_AND_DIGITS) ?? [])];
}

function sizeWords({ width, height }: Pick<CatalogEntry, 'width' | 'height'>): string[] {
  const spelled = [`${width}x${height}`, `${width}×${height}`];
  return width === height ? [String(width), ...spelled] : spelled;
}

/** The words `entry` is found by: its name and its parts, competition, year and size. */
export function searchWords(entry: CatalogEntry): SearchWords {
  return [
    ...new Set([
      ...wordsOf(entry.name),
      ...(entry.competition === undefined ? [] : wordsOf(entry.competition)),
      ...(entry.year === undefined ? [] : [String(entry.year)]),
      ...sizeWords(entry),
    ]),
  ];
}

/** The tokens of a query, lower case; none for an empty query. */
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== '');
}

/** Whether every token starts a word; an empty list of tokens matches everything. */
export function matchesTokens(words: SearchWords, tokens: readonly string[]): boolean {
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

/** The catalog searchable by query, built once. */
export class SearchIndex {
  readonly #words: ReadonlyMap<string, SearchWords>;

  constructor(entries: readonly CatalogEntry[]) {
    this.#words = new Map(entries.map((entry) => [entry.key, searchWords(entry)]));
  }

  /** The entries of `entries` that `query` finds, in their order. */
  search<Entry extends CatalogEntry>(entries: readonly Entry[], query: string): Entry[] {
    const tokens = queryTokens(query);

    if (tokens.length === 0) {
      return [...entries];
    }

    return entries.filter((entry) =>
      matchesTokens(this.#words.get(entry.key) ?? searchWords(entry), tokens)
    );
  }
}
