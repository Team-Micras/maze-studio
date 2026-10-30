import { describe, expect, test } from 'vitest';

import { backupFileName, exportNote, exportReport, importReport } from '@/ui/library/backup-report';

describe('backupFileName', () => {
  test('names the zip by the local date, with two digits for month and day', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('maze-studio-mine-2026-01-05.zip');
    expect(backupFileName(new Date(2026, 10, 25))).toBe('maze-studio-mine-2026-11-25.zip');
  });
});

describe('exportNote', () => {
  test('counts what went in, and what was skipped only when something was', () => {
    expect(exportNote(3, 0)).toBe('Exported 3');
    expect(exportNote(3, 1)).toBe('Exported 3, skipped 1');
  });
});

describe('exportReport', () => {
  test('lists each skipped maze, and each exported without a field, with its reason', () => {
    expect(
      exportReport(
        [
          { id: 'a', name: 'A', message: 'bad code' },
          { id: 'b', name: 'A', message: 'too long' },
        ],
        [{ id: 'c', name: 'C', message: 'left out its malformed recipe' }]
      )
    ).toEqual({
      title: 'Skipped in the export',
      sections: [
        {
          title: 'Skipped',
          rows: [
            { id: 'a', name: 'A', detail: 'bad code' },
            { id: 'b', name: 'A', detail: 'too long' },
          ],
        },
        {
          title: 'Exported without a field',
          rows: [{ id: 'c', name: 'C', detail: 'left out its malformed recipe' }],
        },
      ],
    });
  });
});

describe('importReport', () => {
  test('parts the added from the renamed, and keeps every skipped file apart even with one name', () => {
    const report = importReport(
      [
        { name: 'Alpha', asked: 'Alpha' },
        { name: 'alpha 2', asked: 'alpha' },
      ],
      [
        { name: 'x.txt', message: 'line 1, column 2: bad' },
        { name: 'x.txt', message: 'not a .txt maze file' },
      ]
    );

    expect(report.title).toBe('Import');
    expect(report.sections.map((section) => section.title)).toEqual([
      'Added',
      'Renamed',
      'Skipped',
    ]);
    expect(report.sections[0]?.rows).toEqual([{ id: 'Alpha', name: 'Alpha' }]);
    expect(report.sections[1]?.rows).toEqual([
      { id: 'alpha 2', name: 'alpha 2', detail: 'alpha was taken' },
    ]);
    expect(report.sections[2]?.rows.map((row) => row.detail)).toEqual([
      'line 1, column 2: bad',
      'not a .txt maze file',
    ]);
    expect(new Set(report.sections[2]?.rows.map((row) => row.id)).size).toBe(2);
  });
});
