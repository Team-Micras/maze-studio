/**
 * The generator's worker: one maze per message ({@link runJob}), its walls transferred back. The
 * page terminates it to cancel a run.
 *
 * @module
 */

import { runJob, type Job } from './job';

self.addEventListener('message', (event: MessageEvent<Job>) => {
  const result = runJob(event.data);
  self.postMessage(result, { transfer: [result.grid.walls.buffer] });
});
