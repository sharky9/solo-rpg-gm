import * as pdfjs from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { markLaunch } from "./perf";

pdfjs.GlobalWorkerOptions.workerSrc = workerURL;

// One worker for the app's lifetime, created at module evaluation (app launch,
// via +page.svelte's static import chain) so the fetch/compile/spawn/handshake
// cost never sits between a file pick and a readable page. pdf.js otherwise
// spawns a fresh worker per getDocument call.
export const worker = new pdfjs.PDFWorker();

// Serializes destroy → getDocument across viewer instances: destroying a task
// on the shared worker can disturb others in flight on the same port, and a
// remounted viewer has no reference to its predecessor's in-flight teardown.
export const workerQueue: { settled: Promise<void> } = { settled: Promise.resolve() };

worker.promise.then(
  () => markLaunch("worker-ready"),
  () => {}, // getDocument surfaces worker failures on first use
);
