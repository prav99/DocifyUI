// Production entry point: one worker per CPU core, on macOS, Windows, and
// Linux alike. Workers that crash are respawned with a backoff, so a single
// failing request never takes the service down. Scale within one machine by
// core count (WEB_CONCURRENCY overrides), and across machines by running this
// behind any load balancer — the API is stateless (JWT auth, DB-backed state).
import './env.js'; // CWD-independent .env loading — must stay the first import
import cluster from 'node:cluster';
import os from 'node:os';

const WORKERS = Math.max(1, Number(process.env.WEB_CONCURRENCY) || os.availableParallelism?.() || os.cpus().length);

if (cluster.isPrimary) {
  console.log('DocGen cluster: starting ' + WORKERS + ' worker' + (WORKERS > 1 ? 's' : '') + ' (' + os.platform() + ', ' + os.cpus().length + ' cores)');
  const recentDeaths = [];
  for (let i = 0; i < WORKERS; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    const now = Date.now();
    recentDeaths.push(now);
    while (recentDeaths.length && recentDeaths[0] < now - 60000) recentDeaths.shift();
    console.error('Worker ' + worker.process.pid + ' exited (' + (signal || code) + ')');
    if (recentDeaths.length > WORKERS * 5) {
      // Crash loop — back off instead of forking hot.
      console.error('Crash loop detected; respawning in 5s');
      setTimeout(() => cluster.fork(), 5000);
    } else {
      cluster.fork();
    }
  });

  const shutdown = () => {
    console.log('Cluster shutting down…');
    for (const id of Object.keys(cluster.workers)) cluster.workers[id].kill('SIGTERM');
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  await import('./index.js');
}
