import { describe, expect, test } from 'vitest';

import { updateNote } from '@/ui/library/update-note';

const COMMIT = '548dcde0123456789abcdef0123456789abcdef0';

describe('updateNote', () => {
  test('says nothing until a check has run', () => {
    expect(updateNote({ kind: 'quiet' }, COMMIT)).toBeUndefined();
  });

  test('says what a check is doing or found', () => {
    expect(updateNote({ kind: 'checking' }, COMMIT)).toBe('Checking for updates…');
    expect(updateNote({ kind: 'updated' }, COMMIT)).toBe('Updated');
    expect(updateNote({ kind: 'up-to-date' }, COMMIT)).toBe('Up to date');
  });

  test('gives the reason of a failure and the short commit in use', () => {
    expect(updateNote({ kind: 'failed', reason: 'offline' }, COMMIT)).toBe(
      'Offline, using the copy from 548dcde'
    );
    expect(updateNote({ kind: 'failed', reason: 'rate-limited' }, COMMIT)).toBe(
      'GitHub’s hourly limit reached, using the copy from 548dcde'
    );
    expect(updateNote({ kind: 'failed', reason: 'sha-mismatch' }, COMMIT)).toBe(
      'A file did not match its checksum, using the copy from 548dcde'
    );
    expect(updateNote({ kind: 'failed', reason: 'http-error' }, COMMIT)).toBe(
      'GitHub did not answer, using the copy from 548dcde'
    );
  });
});
