import { useCallback, useEffect, useState } from 'react';

import type { CheckResult } from '@/library';
import { appStorage } from '@/ui/storage';

import type { UpdateStatus } from './update-note';
import { reloadLibrary } from './use-library';

/** The updates from GitHub, and the button's check. */
export interface RepoUpdates {
  readonly status: UpdateStatus;
  /** Asks GitHub now, as Check for updates does. */
  readonly checkNow: () => void;
}

/**
 * Whether the app asks GitHub by itself when it opens: in a production build, unless built with
 * `VITE_AUTO_UPDATES=off`, as the e2e tests are, which route GitHub themselves.
 */
const AUTO_UPDATES = import.meta.env.PROD && import.meta.env.VITE_AUTO_UPDATES !== 'off';

function statusOf(result: CheckResult): UpdateStatus {
  switch (result.status) {
    case 'updated':
      return { kind: 'updated' };
    case 'unchanged':
      return { kind: 'up-to-date' };
    case 'failed':
      return { kind: 'failed', reason: result.reason };
    default:
      return { kind: 'quiet' };
  }
}

/** Asks GitHub, if due or `force`d, and says where the updates stand; a newer commit reloads. */
async function runCheck(force: boolean): Promise<UpdateStatus> {
  const repo = (await appStorage())?.repo;

  if (repo === undefined) {
    return { kind: 'quiet' };
  }

  const result = await repo.check(force);

  if (result.status === 'not-due') {
    const { error } = await repo.meta();
    return error === undefined ? { kind: 'quiet' } : { kind: 'failed', reason: error.reason };
  }

  if (result.status === 'updated') {
    reloadLibrary();
  }

  return statusOf(result);
}

/**
 * The updates of the repository's mazes (PLAN.md 3.2): asked of GitHub at most once a day when the
 * app opens, in production, and at once by Check for updates; a newer commit reloads the library. A failure the
 * last check left stays on the credit until a check succeeds.
 */
export function useRepoUpdates(): RepoUpdates {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'quiet' });

  useEffect(() => {
    let current = true;

    if (!AUTO_UPDATES) {
      return undefined;
    }

    void runCheck(false).then(
      (next) => {
        if (current) {
          setStatus(next);
        }
      },
      () => undefined
    );

    return () => {
      current = false;
    };
  }, []);

  const checkNow = useCallback(() => {
    setStatus({ kind: 'checking' });
    void runCheck(true).then(setStatus, () => setStatus({ kind: 'quiet' }));
  }, []);

  return { status, checkNow };
}
