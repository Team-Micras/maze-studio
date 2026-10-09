import { describe, expect, test } from 'vitest';

import type { Finding, Severity } from '@/maze';
import { checksSummary, passesText } from '@/ui/editor/checks-summary';

function finding(severity: Severity): Finding {
  return { rule: 'loose-post', severity, message: '', cells: [], edges: [], posts: [] };
}

describe('The Checks chip', () => {
  test('counts the errors first, and says them in the plural from two', () => {
    expect(checksSummary([finding('warning'), finding('error'), finding('error')])).toEqual({
      level: 'error',
      label: '2 errors',
    });
  });

  test('counts the warnings when there is no error', () => {
    expect(checksSummary([finding('warning'), finding('hint')])).toEqual({
      level: 'warning',
      label: '1 warning',
    });
  });

  test('passes with hints only, or with nothing', () => {
    expect(checksSummary([finding('hint')])).toEqual({ level: 'ok', label: 'Passes' });
    expect(checksSummary([])).toEqual({ level: 'ok', label: 'Passes' });
  });

  test('names the rules a maze passes', () => {
    expect(passesText('classic')).toBe('Every check passes for the classic rules.');
    expect(passesText('halfsize')).toBe('Every check passes for the half-size rules.');
  });
});
