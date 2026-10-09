/**
 * The vocabulary of validation: profiles, rules, severities and findings.
 *
 * @module
 */

import type { Edge } from './edges';
import type { Cell, Maze } from './maze';
import type { MazeTextSource } from './maze-text';

/**
 * The rules a maze is held to: those of the repository's folders, or `free` for a maze of any
 * size and shape.
 */
export type Profile = 'classic' | 'halfsize' | 'training' | 'free';

/** How much a finding matters; none blocks anything. */
export type Severity = 'error' | 'warning' | 'hint';

/** The rules, in the order findings are listed. */
export const RULES = [
  'file-name',
  'classic-size',
  'homogeneous-grid',
  'no-carriage-return',
  'final-newline',
  'trailer-size',
  'closed-border',
  'single-start',
  'start-corner',
  'goal-area',
  'classic-goal',
  'loose-post',
  'goal-reachable',
  'single-goal-entrance',
] as const;

/** A rule's name. */
export type Rule = (typeof RULES)[number];

/** A corner of the grid where posts stand, `(0, 0)` being the south-west corner of the maze. */
export interface Post {
  readonly x: number;
  readonly y: number;
}

/** One finding: the rule, how much it matters, what to show and where to point. */
export interface Finding {
  readonly rule: Rule;
  readonly severity: Severity;
  readonly message: string;
  readonly cells: readonly Cell[];
  readonly edges: readonly Edge[];
  readonly posts: readonly Post[];
}

/** What a rule check finds, before the profile gives it a severity. */
export type Problem = Omit<Finding, 'rule' | 'severity'>;

/** What validation looks at. */
export interface ValidationInput {
  readonly maze: Maze;
  readonly profile: Profile;
  /** The file the maze was read from, while the document is unchanged. */
  readonly source?: MazeTextSource;
}
