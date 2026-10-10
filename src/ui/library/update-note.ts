/**
 * What the credit island says of the updates from GitHub (PLAN.md 3.2, DESIGN.md 9.1 and 12).
 *
 * @module
 */

import type { UpdateFailure } from '@/library';

/** Where the updates stand, as the credit shows them. */
export type UpdateStatus =
  | { readonly kind: 'quiet' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'updated' }
  | { readonly kind: 'up-to-date' }
  | { readonly kind: 'failed'; readonly reason: UpdateFailure };

const REASONS: Readonly<Record<UpdateFailure, string>> = {
  offline: 'Offline',
  'rate-limited': 'GitHub’s hourly limit reached',
  'sha-mismatch': 'A file did not match its checksum',
  'http-error': 'GitHub did not answer',
  'bad-response': 'GitHub did not answer',
};

/**
 * The words the credit adds after "… at <commit>", if any: "Offline, using the copy from 548dcde"
 * when a check failed.
 */
export function updateNote(status: UpdateStatus, commit: string): string | undefined {
  switch (status.kind) {
    case 'checking':
      return 'Checking for updates…';
    case 'updated':
      return 'Updated';
    case 'up-to-date':
      return 'Up to date';
    case 'failed':
      return `${REASONS[status.reason]}, using the copy from ${commit.slice(0, 7)}`;
    default:
      return undefined;
  }
}
