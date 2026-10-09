/**
 * Validation of a maze: a list of findings, never an exception, so the editor can show and point
 * at each one and never blocks on it. The rules mirror the repository's `test_mazes.py` (the
 * "repo" rules) and add a few that prove a maze can be run (the "proof" rules); which rules apply,
 * and how severe they are, depends on the profile.
 *
 * Rules about the file (its name, its grid's shape, carriage returns, the final line feed, the
 * length of the trailer) read the document's `source`, and so only apply until the document is
 * edited or normalized; the others read the maze.
 *
 * @module
 */

import { MAZE_RULE_CHECKS } from './validation-rules';
import {
  RULES,
  type Finding,
  type Profile,
  type Rule,
  type Severity,
  type ValidationInput,
} from './validation-types';

export {
  RULES,
  type Finding,
  type Post,
  type Problem,
  type Profile,
  type Rule,
  type Severity,
  type ValidationInput,
} from './validation-types';

type Severities = Readonly<Record<Profile, Severity | undefined>>;

function severities(
  classic: Severity | undefined,
  halfsize: Severity | undefined,
  training: Severity | undefined,
  free: Severity | undefined
): Severities {
  return { classic, halfsize, training, free };
}

/** How severe each rule is under each profile; a rule a profile does not hold is `undefined`. */
export const RULE_SEVERITIES: Readonly<Record<Rule, Severities>> = {
  'file-name': severities('error', 'error', 'error', 'hint'),
  'classic-size': severities('error', undefined, 'error', undefined),
  'homogeneous-grid': severities('error', 'error', 'error', 'error'),
  'no-carriage-return': severities('error', 'error', 'error', 'warning'),
  'final-newline': severities('error', 'error', 'error', 'warning'),
  'trailer-size': severities('warning', 'warning', 'warning', 'warning'),
  'closed-border': severities('error', 'error', 'error', 'warning'),
  'single-start': severities('error', 'error', 'error', 'error'),
  'start-corner': severities('error', 'error', undefined, 'hint'),
  'goal-area': severities('error', 'error', undefined, 'warning'),
  'classic-goal': severities('error', undefined, undefined, undefined),
  'loose-post': severities('warning', 'warning', undefined, undefined),
  'goal-reachable': severities('warning', 'warning', 'warning', 'warning'),
  'single-goal-entrance': severities('warning', 'warning', undefined, undefined),
};

const FOLDER_PROFILES: Readonly<Record<string, Profile>> = {
  classic: 'classic',
  halfsize: 'halfsize',
  training: 'training',
};

/** The profile of a repository path, by its folder; `free` outside the three folders. */
export function profileOfPath(path: string): Profile {
  return FOLDER_PROFILES[path.split('/')[0] ?? ''] ?? 'free';
}

/**
 * Checks a maze against the rules of its profile.
 *
 * @returns The findings, in the order of {@link RULES}; empty for a maze that passes them all.
 */
export function validateMaze(input: ValidationInput): readonly Finding[] {
  const findings: Finding[] = [];

  for (const rule of RULES) {
    const severity = RULE_SEVERITIES[rule][input.profile];

    if (severity !== undefined) {
      for (const problem of MAZE_RULE_CHECKS[rule](input)) {
        findings.push(Object.freeze({ rule, severity, ...problem }));
      }
    }
  }

  return Object.freeze(findings);
}
