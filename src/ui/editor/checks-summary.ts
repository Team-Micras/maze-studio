/**
 * What the Checks chip says (DESIGN.md 6 and 12): the errors if there are any, else the warnings,
 * else that the maze passes; hints never change it.
 *
 * @module
 */

import type { Finding, Profile } from '@/maze';

/** How the chip looks: red for errors, amber for warnings, green when the maze passes. */
export type ChecksLevel = 'error' | 'warning' | 'ok';

/** The chip's level, words, and the count a phone shows. */
export interface ChecksSummary {
  readonly level: ChecksLevel;
  readonly label: string;
  /** The errors or warnings counted; 0 when the maze passes. */
  readonly count: number;
}

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The chip for `findings`: "2 errors", "1 warning" or "Passes". */
export function checksSummary(findings: readonly Finding[]): ChecksSummary {
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;

  if (errors > 0) {
    return { level: 'error', label: counted(errors, 'error'), count: errors };
  }

  return warnings > 0
    ? { level: 'warning', label: counted(warnings, 'warning'), count: warnings }
    : { level: 'ok', label: 'Passes', count: 0 };
}

const RULE_WORDS: Readonly<Record<Profile, string>> = {
  classic: 'classic',
  halfsize: 'half-size',
  training: 'training',
  free: 'free',
};

/** The panel's row for a maze with no finding: "Every check passes for the classic rules." */
export function passesText(profile: Profile): string {
  return `Every check passes for the ${RULE_WORDS[profile]} rules.`;
}

/** A key that tells a finding apart among those of one check. */
export function findingKey(finding: Finding, index: number): string {
  return `${finding.rule}#${index}`;
}
