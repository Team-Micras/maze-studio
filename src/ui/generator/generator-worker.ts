/**
 * The generator's worker: one maze per message ({@link runJob}), its progress streamed and its walls
 * transferred back. The page terminates it on a new run or when the panel closes.
 *
 * @module
 */

import { runJob, type Job, type JobMessage } from './job';

const send = (message: JobMessage, transfer: Transferable[]): void =>
  self.postMessage(message, { transfer });

self.addEventListener('message', (event: MessageEvent<Job>) => {
  const result = runJob(event.data, (progress) =>
    send({ kind: 'progress', progress }, [progress.walls.buffer])
  );
  send({ kind: 'result', result }, [result.grid.walls.buffer]);
});
