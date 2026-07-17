// Load-pipeline timing. Ships in release builds — the success criterion is
// measured there. Remove by deleting the call sites; this module has no state
// the app depends on.

const launchMarks: Record<string, number> = {};

/** Marks measured from app start (e.g. worker-ready), outside any load. */
export function markLaunch(name: string) {
  launchMarks[name] = Math.round(performance.now());
}

let pickAt = 0;
let stages: Record<string, number> = {};

/** A new load begins the moment the user's file pick resolves. */
export function beginLoad() {
  pickAt = performance.now();
  stages = {};
}

/** Stage timing relative to the current load's pick. No-op outside a load. */
export function mark(name: string) {
  if (pickAt) stages[name] = Math.round(performance.now() - pickAt);
}

/** One summary per completed load. */
export function summarize() {
  if (!pickAt) return;
  pickAt = 0;
  const rows: Record<string, string> = {};
  for (const [k, v] of Object.entries(launchMarks)) rows[k] = `launch+${v}ms`;
  for (const [k, v] of Object.entries(stages)) rows[k] = `pick+${v}ms`;
  console.table(rows);
}
