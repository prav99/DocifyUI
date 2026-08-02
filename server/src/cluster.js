// Production entry point: one worker per CPU core, on macOS, Windows, and
// Linux alike. Workers that crash are respawned with a backoff, so a single
// failing request never takes the service down. Scale within one machine by
// core count (WEB_CONCURRENCY overrides), and across machines by running this
// behind any load balancer — the API is stateless (JWT auth, DB-backed state).
import './env.js'; // CWD-independent .env loading — must stay the first import
import cluster from 'node:cluster';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKERS = Math.max(1, Number(process.env.WEB_CONCURRENCY) || os.availableParallelism?.() || os.cpus().length);

/* ---------------- Singleton-worker contract ----------------
   Every fork is given a stable WORKER_INDEX (0…WORKERS-1) that survives a
   respawn, so exactly one live process always answers isSingletonWorker().
   Anything that must happen once per SERVICE rather than once per process —
   sampling uptime, running a scheduler — has to be guarded by it, or N workers
   record N samples for the same interval. Running index.js directly (dev, or
   `node src/index.js`) leaves WORKER_INDEX unset, which is index 0: a single
   process is its own singleton. */
export { WORKER_INDEX, isSingletonWorker } from './worker.js';
import { WORKER_INDEX } from './worker.js';

// Importing this module (for the helper above) must never fork a cluster, so
// the supervisor only runs when this file is the process entry point.
const isEntryPoint = Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint && cluster.isPrimary) {
  console.log('Docify cluster: starting ' + WORKERS + ' worker' + (WORKERS > 1 ? 's' : '') + ' (' + os.platform() + ', ' + os.cpus().length + ' cores)');
  const recentDeaths = [];
  const indexOf = new Map();   // cluster worker id -> WORKER_INDEX
  let shuttingDown = false;
  let pendingRespawns = 0;

  // Beyond this many deaths in the window the fault is not transient: keep
  // forking and the host sees a healthy-looking service that serves nothing.
  const GIVE_UP_AFTER = WORKERS * 20;
  const BACKOFF_AT = WORKERS * 5;

  const spawn = (index) => {
    const worker = cluster.fork({ WORKER_INDEX: String(index) });
    indexOf.set(worker.id, index);
    return worker;
  };
  for (let i = 0; i < WORKERS; i++) spawn(i);

  cluster.on('exit', (worker, code, signal) => {
    const index = indexOf.get(worker.id) ?? 0;
    indexOf.delete(worker.id);
    console.error('Worker ' + worker.process.pid + ' (index ' + index + ') exited (' + (signal || code) + ')');
    // During shutdown every worker exits by design — respawning here would
    // fight the drain and leave orphans behind.
    if (shuttingDown) return;

    const now = Date.now();
    recentDeaths.push(now);
    while (recentDeaths.length && recentDeaths[0] < now - 60000) recentDeaths.shift();

    if (recentDeaths.length > GIVE_UP_AFTER) {
      console.error('Crash loop persists (' + recentDeaths.length + ' worker deaths in 60s); exiting so the platform can surface it.');
      shuttingDown = true;
      for (const id of Object.keys(cluster.workers)) cluster.workers[id].kill('SIGTERM');
      // Deliberately not unref'd: the exit code has to be non-zero even after
      // the last worker's handle is gone, or the platform reads it as clean.
      setTimeout(() => process.exit(1), 3000);
      return;
    }

    if (recentDeaths.length > BACKOFF_AT) {
      // Back off instead of forking hot, and cap the number of restarts waiting
      // in flight so a fast crash loop cannot queue timers without bound.
      if (pendingRespawns >= WORKERS) return;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(5, recentDeaths.length - BACKOFF_AT));
      console.error('Crash loop detected; respawning index ' + index + ' in ' + Math.round(delay / 1000) + 's');
      pendingRespawns += 1;
      setTimeout(() => {
        pendingRespawns -= 1;
        if (!shuttingDown) spawn(index);
      }, delay);
      return;
    }
    spawn(index);
  });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('Cluster shutting down…');
    for (const id of Object.keys(cluster.workers)) cluster.workers[id].kill('SIGTERM');
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else if (isEntryPoint) {
  await import('./index.js');
}
