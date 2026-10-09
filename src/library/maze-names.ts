/**
 * The competition and year a repository maze comes from, read from its file name with a fixed
 * list of known competitions and no guessing: a name that matches none keeps only its name, and
 * a year is read only from four digits, or from the two digits of an `AAMC<yy>Maze` name.
 *
 * @module
 */

/** What a file name says about where a maze comes from. */
export interface MazeOrigin {
  /** The competition, in English, when the name starts with a known one. */
  readonly competition?: string;
  /** The year of the competition, when the name says it plainly. */
  readonly year?: number;
}

interface KnownCompetition {
  readonly name: string;
  readonly pattern: RegExp;
}

/** The competitions known by the start of a file name, the most specific first. */
const KNOWN_COMPETITIONS: readonly KnownCompetition[] = [
  { name: 'All Japan', pattern: /^alljapan(?![a-z])/i },
  { name: 'East Japan', pattern: /^eastjapan(?![a-z])/i },
  { name: 'Japan', pattern: /^japan(?![a-z])/i },
  { name: 'Chubu', pattern: /^chubu(?![a-z])/i },
  { name: 'Hokuriku', pattern: /^hokuriku(?![a-z])/i },
  { name: 'Hokkaido', pattern: /^hokkaido(?![a-z])/i },
  { name: 'Kansai', pattern: /^kansai(?![a-z])/i },
  { name: 'Kyushu', pattern: /^kyushu(?![a-z])/i },
  { name: 'Northeast', pattern: /^northeast(?![a-z])/i },
  { name: 'AAMC', pattern: /^aamc/i },
  { name: 'APEC', pattern: /^apec(?![a-z])/i },
  { name: 'CAMM', pattern: /^camm(?![a-z])/i },
  { name: 'IEE', pattern: /^iee(?![a-z])/i },
  { name: 'Korea', pattern: /^kor(ea)?(?=\d)/i },
  { name: 'Minos', pattern: /^minos(?![a-z])/i },
  { name: 'OSHWDEM', pattern: /^oshwdem(?![a-z])/i },
  { name: 'Portugal', pattern: /^portugal(?![a-z])/i },
  { name: 'RoboChallenge Brazil', pattern: /^br\d{4}-robochallenge(?![a-z])/i },
  { name: 'Taiwan', pattern: /^taiwan(?![a-z])/i },
  { name: 'UK', pattern: /^uk(nov|oct)?(?![a-z])/i },
  { name: 'US', pattern: /^usa?(?![a-z])/i },
];

const FOUR_DIGIT_YEAR = /(?<!\d)(19[789]\d|20[0-9]\d)(?!\d)/;
const AAMC_YEAR = /^aamc(\d{2})maze$/i;
const AAMC_CENTURY = 2000;

function yearOf(stem: string): number | undefined {
  const aamc = AAMC_YEAR.exec(stem)?.[1];

  if (aamc !== undefined) {
    return AAMC_CENTURY + Number(aamc);
  }

  const year = FOUR_DIGIT_YEAR.exec(stem)?.[1];
  return year === undefined ? undefined : Number(year);
}

/**
 * The competition and year in a maze's file name, such as `japan2011hef` (Japan, 2011) or
 * `AAMC15Maze` (AAMC, 2015); empty for a name with no known competition.
 *
 * @param stem The file name without its folder and `.txt`.
 */
export function mazeOrigin(stem: string): MazeOrigin {
  const known = KNOWN_COMPETITIONS.find(({ pattern }) => pattern.test(stem));

  if (known === undefined) {
    return {};
  }

  const year = yearOf(stem);
  return year === undefined ? { competition: known.name } : { competition: known.name, year };
}
