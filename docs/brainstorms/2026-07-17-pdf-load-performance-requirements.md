---
date: 2026-07-17
topic: pdf-load-performance
---

# PDF Load Performance — Requirements

## Summary

Make the file-pick → readable-page path fast: instrument the load pipeline, give first paint immediate perceived feedback, render page 1 before any other work, and take the cheap real-latency wins (warm the pdf.js worker at launch, drop the redundant byte copy). Heavier pipeline work stays deferred behind measurement evidence. A small sweep of low-risk general free wins rides along.

---

## Problem Frame

Opening the main gamebook after picking its file leaves the viewer blank/white for several seconds before a readable page appears. The PDF is small (<10MB), which makes that wait surprising — the cost is somewhere in the pipeline (full file read over Tauri IPC, an extra in-memory copy, pdf.js parse, all-page placeholder construction, first canvas render), in dev-mode overhead, or both. The slowness has mostly been observed under `npm run tauri dev`; no release-build comparison has been made, and no stage of the pipeline has ever been timed.

---

## Key Decisions

- **Measurement gates the heavy work.** Instrumentation and a dev-vs-release comparison come first; Tauri asset-protocol streaming and a cached-first-paint snapshot are deferred unless release-build numbers show file read/parse dominates.
- **Perceived speed is a first-class goal, not a fallback.** The viewer must never sit blank after a file is picked, independent of how much raw latency is recovered.
- **Success is judged on a release build.** Dev-mode overhead is not a target of this work; if most of the wait is dev-only, the criterion is still met when release is fast.
- **Auto-resume stays out.** Manual file opening each launch is kept; only the post-pick path is optimized.

---

## Requirements

**Instrumentation & baseline**

- R1. The load pipeline emits timing marks for each stage: file read, document parse, placeholder construction, and first page render.
- R2. A one-time dev-vs-release comparison of those timings is recorded, establishing where the wait actually lives.

**Perceived speed**

- R3. Picking a file shows a loading state in the viewer area immediately — the blank/white gap is eliminated.
- R4. Page 1 (the page the user will see) renders before bulk work for the remaining pages, so a readable page appears as early as the pipeline allows.

**Cheap pipeline wins**

- R5. The pdf.js worker is initialized at app launch rather than on first document open, so worker startup does not sit inside the post-pick wait.
- R6. The redundant full-buffer copy made when handing bytes to pdf.js is eliminated or made unnecessary.

**General free wins**

- R7. While in the code, low-risk improvements found elsewhere in the app may be taken opportunistically, with behavior preserved; anything requiring structural change is out of scope.

---

## Success Criteria

- On a release build, a readable page 1 appears within ~1 second of picking the main gamebook file.
- A visible loading state appears within ~100ms of picking any file.
- Timing marks exist to demonstrate both, and to justify (or dismiss) any follow-up pipeline work.

---

## Scope Boundaries

Deferred for later, pending R2 evidence:

- Tauri asset-protocol / streaming delivery of the PDF to pdf.js (range reads instead of full in-memory load).
- Cached first-paint snapshot per book (instant blit of the last rendered first spread while the live render catches up).

Out of scope for this work:

- Auto-resume of last book and page — adjacent (listed as recommended in `DECISIONS.md`) but kept out; manual file opening remains.
- Any change to the existing lazy page rendering (IntersectionObserver with lookahead), which already works well.

---

## Acceptance Examples

- AE1. **Covers R3, R4.** Given the app is open, when the user picks the gamebook PDF, then the viewer shows a loading state within ~100ms and a readable page 1 appears without waiting for the remaining pages' placeholders or renders.
- AE2. **Covers R2, R5, R6.** Given a release build and the instrumented pipeline, when the gamebook is opened, then the recorded timings show no worker-startup cost inside the post-pick window and no full-buffer copy stage.

---

## Sources

- `solo-rpg-companion/src/routes/+page.svelte:52-61` — file read via Tauri plugin-fs and conditional viewer mount with no loading state.
- `solo-rpg-companion/src/lib/PdfViewer.svelte:2-7, 54-61, 73-93, 117-153` — worker setup at component load, `getDocument` with in-memory `data: bytes.slice()` and no streaming options, all-page placeholder loop, IntersectionObserver lazy render.
- `DECISIONS.md` — product identity, layout, and the deferred "resume where I left off" item.
