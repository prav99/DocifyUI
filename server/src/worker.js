/* Which worker am I?
   A leaf module ON PURPOSE: it imports nothing. cluster.js starts the server
   with a top-level `await import('./index.js')`, so anything index.js loads
   that imports cluster.js back forms a cycle around that await — and an ESM
   cycle through a top-level await deadlocks. The worker then hangs forever:
   never listening, never crashing, so a platform health check just times out.
   Keeping this here means api.js (and anything else) can ask which worker it
   is without ever importing the supervisor. */

// The primary assigns a stable index per fork and re-supplies it on respawn, so
// exactly one live process always answers isSingletonWorker(). Running
// index.js directly (dev) leaves it unset, which is index 0: a single process
// is its own singleton.
export const WORKER_INDEX = Number.isFinite(Number(process.env.WORKER_INDEX))
  ? Number(process.env.WORKER_INDEX)
  : 0;

// Guard for work that must happen once per SERVICE rather than once per
// process — sampling uptime, sweeping interrupted runs. Without it, N workers
// do the same job N times.
export const isSingletonWorker = () => WORKER_INDEX === 0;
