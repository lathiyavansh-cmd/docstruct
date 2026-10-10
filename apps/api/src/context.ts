import type { AppConfig } from './config.js';
import type { Database } from './db/database.js';
import type { ObjectStore } from './storage/object-store.js';

/** Background work started by a request (text extraction, change summaries) that must not block it. */
export class JobQueue {
  private readonly running = new Set<Promise<unknown>>();

  constructor(private readonly log: (msg: string, err?: unknown) => void) {}

  run(name: string, task: () => Promise<unknown>): void {
    const promise = task()
      .catch((err) => this.log(`background job "${name}" failed`, err))
      .finally(() => this.running.delete(promise));
    this.running.add(promise);
  }

  /** Resolves once every queued job has settled (used by tests and graceful shutdown). */
  async idle(): Promise<void> {
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
