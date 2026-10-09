import { beforeAll, describe, expect, test } from 'vitest';

import {
  DEFAULT_FILTER,
  filterCatalog,
  loadSnapshot,
  queryTokens,
  repoCatalog,
  SearchIndex,
  searchWords,
  type CatalogEntry,
} from '@/library';

let catalog: CatalogEntry[];
let index: SearchIndex;

beforeAll(async () => {
  catalog = repoCatalog((await loadSnapshot()).files);
  index = new SearchIndex(catalog);
});

function entry(name: string, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    key: `repo:classic/${name}.txt`,
    origin: 'repo',
    name,
    category: 'classic',
    width: 16,
    height: 16,
    ...extra,
  };
}

function names(query: string): string[] {
  return index.search(catalog, query).map((found) => found.name);
}

describe('searchWords', () => {
  test('index the name, its parts, the competition, the year and the size', () => {
    expect(
      searchWords(
        entry('japan2011hef', { competition: 'Japan', year: 2011, width: 32, height: 32 })
      )
    ).toEqual(
      expect.arrayContaining(['japan2011hef', 'japan', '2011', 'hef', '32', '32x32', '32×32'])
    );
  });

  test('spell a size that is not square only with both sides', () => {
    const words = searchWords(entry('wide-corridor', { width: 10, height: 5 }));

    expect(words).toEqual(expect.arrayContaining(['10x5', '10×5', 'wide', 'corridor']));
    expect(words).not.toContain('5');
    expect(words).not.toContain('10');
  });

  test('split the competition into its words', () => {
    expect(searchWords(entry('alljapan2005', { competition: 'All Japan' }))).toEqual(
      expect.arrayContaining(['all japan', 'all', 'japan'])
    );
  });
});

describe('queryTokens', () => {
  test('split on any run of spaces, in lower case', () => {
    expect(queryTokens('  Japan   2011 ')).toEqual(['japan', '2011']);
    expect(queryTokens('   ')).toEqual([]);
  });
});

describe('The search over the pinned repository', () => {
  test('japan 2011 finds japan2011hef and nothing from another year', () => {
    const found = index.search(catalog, 'japan 2011');

    expect(found.map((maze) => maze.name)).toContain('japan2011hef');
    expect(found.every((maze) => maze.year === 2011)).toBe(true);
  });

  test('21 finds the six 21×21 mazes and nothing else', () => {
    const found = index.search(catalog, '21');

    expect(found).toHaveLength(6);
    expect(found.every((maze) => maze.width === 21 && maze.height === 21)).toBe(true);
  });

  test.each(['21x21', '21×21', '21X21'])('%s finds the same six', (query) => {
    expect(names(query)).toEqual(names('21'));
  });

  test('every token must start a word, so the middle of a word finds nothing', () => {
    expect(names('apan')).toEqual([]);
    expect(names('JAPAN').length).toBe(names('japan').length);
    expect(names('japan zzz')).toEqual([]);
  });

  test('an empty query finds every maze, in catalog order', () => {
    expect(index.search(catalog, ' ')).toEqual(catalog);
  });
});

describe('filterCatalog', () => {
  test('keeps one source and one category, then searches', () => {
    const halfsize = filterCatalog(catalog, { ...DEFAULT_FILTER, category: 'halfsize' }, index);
    const mine = filterCatalog(catalog, { ...DEFAULT_FILTER, source: 'mine' }, index);
    const searched = filterCatalog(
      catalog,
      { source: 'repo', category: 'halfsize', query: '21' },
      index
    );

    expect(halfsize.length).toBeGreaterThan(0);
    expect(halfsize.every((maze) => maze.category === 'halfsize')).toBe(true);
    expect(mine).toEqual([]);
    expect(searched).toHaveLength(6);
    expect(filterCatalog(catalog, DEFAULT_FILTER, index)).toEqual(catalog);
  });
});
