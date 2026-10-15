/**
 * What this file does
 *   Defines the AppContext object that is passed to every module, and a tiny JobQueue
 *   for background work.
 *
 * How it works
 *   - JobQueue.run() starts a task without waiting for it and logs it if it fails.
 *   - JobQueue.idle() waits until all running tasks are finished.
 *   - AppContext groups config, database, object store, job queue and logger.
 *
 * Where it fits
 *   Built by bootstrap.ts and passed to createApp() and each module router.
 *   Module: server core (owner: Vansh).
 */
import type { AppConfig } from './config.js';
import type { Database } from './db/database.js';
import type { ObjectStore } from './storage/object-store.js';

/** Background work started by a request (text extraction, change summaries) that must not block it. */
export class JobQueue {
  private readonly running = new Set<Promise<unknown>>();

  constructor(private readonly log: (msg: string, err?: unknown) => void) {}

  run(name: string, task: () => Promise<unknown>): void {
    // The caller does not await this. Errors are logged instead of crashing the server,
    // and the promise removes itself from the set when it finishes.
    const promise = task()
      .catch((err) => this.log(`background job "${name}" failed`, err))
      .finally(() => this.running.delete(promise));
    this.running.add(promise);
  }

  /** Resolves once every queued job has settled (used by tests and graceful shutdown). */
  async idle(): Promise<void> {
    // Loop because a finished job may have started new jobs while we waited.
    while (this.running.size) await Promise.allSettled([...this.running]);
  }
}

export interface AppContext {
  config: AppConfig;
  db: Database;
  storage: ObjectStore;
  jobs: JobQueue;
  log: (msg: string, err?: unknown) => void;
}
