import { describe, expect, test } from 'vitest';

import { mazeOrigin } from '@/library/maze-names';

describe('the competition and year of a file name', () => {
  test.each([
    ['japan2011hef', 'Japan', 2011],
    ['AAMC15Maze', 'AAMC', 2015],
    ['AAMCUCLAMM2018', 'AAMC', 2018],
    ['alljapan-001-1980', 'All Japan', 1980],
    ['alljapan-032-2011-exp-fin', 'All Japan', 2011],
    ['eastjapan-028-2010', 'East Japan', 2010],
    ['apec2002-2002', 'APEC', 2002],
    ['uk2024-megacon-c-14x14', 'UK', 2024],
    ['uknov2015a', 'UK', 2015],
    ['ukoct2019', 'UK', 2019],
    ['UK-techfest-2022-a', 'UK', 2022],
    ['uk-spring-2023-half-size', 'UK', 2023],
    ['br2025-robochallenge-day2', 'RoboChallenge Brazil', 2025],
    ['Portugal-2025-Final', 'Portugal', 2025],
    ['taiwan2018cef', 'Taiwan', 2018],
    ['korea94x', 'Korea', undefined],
    ['kor891', 'Korea', undefined],
    ['us88a', 'US', undefined],
    ['usa-2', 'US', undefined],
    ['minos24-a', 'Minos', undefined],
    ['japan5', 'Japan', undefined],
    ['oshwdem2019', 'OSHWDEM', 2019],
    ['iee1993-1993', 'IEE', 1993],
  ])('%s is %s, %s', (stem, competition, year) => {
    expect(mazeOrigin(stem)).toEqual(year === undefined ? { competition } : { competition, year });
  });

  test.each([
    'tyubu200906',
    'hk90',
    'student-010-1995',
    'maze-train-10x5-a',
    'empty',
    'uknown',
    'usual',
    'japanese',
    'apecs',
    'korean',
    'bos92',
  ])('%s says nothing it would have to guess', (stem) => {
    expect(mazeOrigin(stem)).toEqual({});
  });
});
