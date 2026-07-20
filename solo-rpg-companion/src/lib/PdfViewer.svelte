<script lang="ts">
  import * as pdfjs from "pdfjs-dist";
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
  import { onDestroy } from "svelte";
  import * as perf from "./perf";
  import { worker, workerQueue } from "./pdfWorker";

  let {
    data,
    perfLog = true,
    onready,
    onerror,
  }: {
    data: Uint8Array;
    perfLog?: boolean; // off for secondary instances — perf state is module-global
    onready?: () => void;
    onerror?: (message: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;
  let doc: PDFDocumentProxy | null = null;
  let numPages = $state(0);
  let currentPage = $state(1);
  let zoomPct = $state(100);
  let spread = false; // two-page book view: cover alone, then 2-3, 4-5, …

  // scale 1.0 = fit-width, computed on load
  let fitWidthScale = 1;
  let scale = 1;
  let baseW = 0; // page 1 size at scale 1, used for all placeholders
  let baseH = 0;

  type Slot = {
    el: HTMLDivElement;
    rendered: boolean;
    task: RenderTask | null;
  };
  let slots: Slot[] = [];
  let io: IntersectionObserver | null = null;
  let loadSeq = 0; // a newer load supersedes one still in flight

  $effect(() => {
    if (data && container) load(data);
  });

  onDestroy(() => {
    loadSeq++; // a destroy-triggered load rejection is supersession, not an error
    void teardown();
  });

  async function teardown() {
    io?.disconnect();
    io = null;
    for (const s of slots) s.task?.cancel();
    slots = [];
    const prev = loadingTask;
    loadingTask = null;
    doc = null;
    // settle the previous task before a new getDocument shares the worker —
    // destroying a task mid-flight can disturb others on the same port.
    // Published on workerQueue so a remounted viewer instance waits too.
    if (prev) {
      const settled = prev.destroy().catch(() => {});
      // chain, never replace: two viewer instances can tear down in the same
      // flush, and an overwritten slot would let getDocument run while the
      // other instance's destroy is still in flight on the port
      workerQueue.settled = Promise.allSettled([workerQueue.settled, settled]).then(() => {});
      await settled;
    }
  }

  async function load(bytes: Uint8Array) {
    const seq = ++loadSeq;
    await teardown();
    await workerQueue.settled; // a prior instance's teardown may still be settling
    if (seq !== loadSeq) return; // superseded while the old task settled
    container.innerHTML = "";

    // the buffer transfers (detaches) to the worker: bytes are unusable
    // from here on, so nothing may read them again
    loadingTask = pdfjs.getDocument({
      worker,
      data: bytes,
      wasmUrl: "/pdfjs/wasm/",
      iccUrl: "/pdfjs/iccs/",
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
    });
    let nextDoc: PDFDocumentProxy;
    try {
      nextDoc = await loadingTask.promise;
    } catch (e) {
      if (seq !== loadSeq) return; // destroyed by a newer load, not an error
      onerror?.(
        `Couldn't open the PDF — it may be corrupt or unsupported. (${e instanceof Error ? e.message : e})`,
      );
      return;
    }
    if (seq !== loadSeq) return;
    doc = nextDoc;
    if (perfLog) perf.mark("parse");
    numPages = doc.numPages;
    currentPage = 1;

    try {
      const first = await doc.getPage(1);
      if (seq !== loadSeq) return;
      const base = first.getViewport({ scale: 1 });
      baseW = base.width;
      baseH = base.height;

      await buildLayout(true);
    } catch (e) {
      // without this, a post-parse failure strands the host in loading state
      if (seq !== loadSeq) return;
      onerror?.(
        `Couldn't display the first page — the PDF may be corrupt. (${e instanceof Error ? e.message : e})`,
      );
    }
  }

  let buildSeq = 0; // a rebuild (spread toggle) invalidates a pending deferred fill

  // rows and placeholders from the already-parsed doc; also the spread-toggle
  // path, which must never re-parse (the source buffer is detached).
  // deferBulk renders page 1 before the O(numPages) DOM work, which then
  // happens behind a frame so the reader isn't waiting on it.
  async function buildLayout(deferBulk: boolean) {
    const bseq = ++buildSeq;
    const seq = loadSeq;
    const stale = () => seq !== loadSeq || bseq !== buildSeq;
    io?.disconnect();
    for (const s of slots) s.task?.cancel();
    slots = [];
    container.innerHTML = "";
    computeFit();
    scale = fitWidthScale * (zoomPct / 100);

    io = new IntersectionObserver(onIntersect, {
      root: container,
      rootMargin: "150% 0px", // render ~1.5 screens ahead, drop what falls behind
    });

    let row: HTMLDivElement | null = null;
    // observe: every slot must eventually be observed (rendered ones included —
    // page 1 has to re-render after zoom drops its canvas; the render() guard
    // stops double-renders). The eager path defers observing page 1 until its
    // render settles, or the observer could re-enter render(1) mid-await.
    const addPage = (i: number, observe = true) => {
      // book layout: the cover sits alone, then facing pairs (2-3, 4-5, …)
      if (!spread || i === 1 || i % 2 === 0) {
        row = document.createElement("div");
        row.className = "row";
        container.appendChild(row);
      }
      const el = document.createElement("div");
      el.className = "page";
      el.dataset.page = String(i);
      sizePlaceholder(el, baseW, baseH);
      row!.appendChild(el);
      slots.push({ el, rendered: false, task: null });
      if (observe) io!.observe(el);
    };
    const fillRemaining = () => {
      for (let i = 2; i <= numPages; i++) addPage(i);
    };

    if (!deferBulk) {
      addPage(1);
      fillRemaining();
      return;
    }

    addPage(1, false);
    await render(1); // a readable page before any bulk placeholder work
    if (stale()) return;
    if (!slots[0].rendered) {
      onerror?.("Couldn't display the first page — the PDF may be corrupt.");
      return;
    }
    if (perfLog) perf.mark("first-render");
    onready?.(); // once per load, owned by the load pipeline
    io.observe(slots[0].el);
    requestAnimationFrame(() => {
      if (stale()) return;
      fillRemaining();
      if (perfLog) {
        perf.mark("placeholders");
        perf.summarize();
      }
    });
  }

  function computeFit() {
    const pad = 48;
    const gap = 16;
    fitWidthScale = spread
      ? (container.clientWidth - pad - gap) / (2 * baseW)
      : (container.clientWidth - pad) / baseW;
  }

  function sizePlaceholder(el: HTMLDivElement, w: number, h: number) {
    el.style.width = `${w * scale}px`;
    el.style.height = `${h * scale}px`;
  }

  function onIntersect(entries: IntersectionObserverEntry[]) {
    for (const e of entries) {
      const i = Number((e.target as HTMLDivElement).dataset.page);
      if (e.isIntersecting) render(i);
      else unrender(i);
    }
  }

  async function render(i: number) {
    const slot = slots[i - 1];
    if (!doc || !slot || slot.rendered || slot.task) return;

    const page = await doc.getPage(i);
    // identity check: the layout may have been rebuilt (spread/zoom) or another
    // render(i) may have won the race while this one awaited getPage
    if (slots[i - 1] !== slot || slot.rendered || slot.task) return;

    const vp = page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;

    slot.el.style.width = `${vp.width}px`;
    slot.el.style.height = `${vp.height}px`;

    const ctx = canvas.getContext("2d")!;
    slot.task = page.render({
      canvas,
      canvasContext: ctx,
      viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });

    try {
      await slot.task.promise;
      slot.el.replaceChildren(canvas);
      slot.rendered = true;
    } catch {
      // render cancelled (scrolled away / zoom changed) — placeholder stays
    } finally {
      slot.task = null;
    }
  }

  function unrender(i: number) {
    const slot = slots[i - 1];
    if (!slot) return;
    slot.task?.cancel();
    slot.task = null;
    if (slot.rendered) {
      slot.el.replaceChildren(); // free the canvas, keep the sized placeholder
      slot.rendered = false;
    }
  }

  function onScroll() {
    // current page = the one crossing the vertical midpoint of the viewport
    const mid = container.scrollTop + container.clientHeight / 2;
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i].el;
      if (el.offsetTop <= mid && mid < el.offsetTop + el.offsetHeight) {
        currentPage = i + 1;
        break;
      }
    }
  }

  export function setZoom(pct: number) {
    zoomPct = Math.min(400, Math.max(50, Math.round(pct)));
    rescale();
  }
  export function zoomIn() { setZoom(zoomPct * 1.2); }
  export function zoomOut() { setZoom(zoomPct / 1.2); }

  export function setSpread(on: boolean) {
    if (spread === on) return;
    spread = on; // sync even mid-load so the finishing load lays out correctly
    if (!doc) return;
    const anchor = currentPage;
    void buildLayout(false); // synchronous full rebuild; zoomPct preserved
    goToPage(anchor);
  }

  // re-fit to the container's current width (e.g. after a split-pane resize),
  // preserving the current page and zoom percentage relative to the new fit
  export function refit() {
    if (!doc) return;
    computeFit();
    void rescale();
  }

  async function rescale() {
    if (!doc) return;
    const anchor = currentPage;
    scale = fitWidthScale * (zoomPct / 100);

    for (let i = 0; i < slots.length; i++) {
      unrender(i + 1);
      sizePlaceholder(slots[i].el, baseW, baseH);
    }
    goToPage(anchor);
    // placeholders resized: nudge the observer to re-evaluate what's visible
    io?.disconnect();
    for (const s of slots) io?.observe(s.el);
  }

  export function goToPage(n: number) {
    const slot = slots[n - 1];
    if (slot) container.scrollTo({ top: slot.el.offsetTop - 16 });
  }

  export function pageInfo() {
    return { current: currentPage, total: numPages };
  }
</script>

<div class="viewer" bind:this={container} onscroll={onScroll}></div>

<style>
  .viewer {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overflow-x: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 16px 0;
    background: var(--viewer-bg, #262220);
  }
  .viewer :global(.row) {
    display: flex;
    gap: 16px;
    flex-shrink: 0;
  }
  .viewer :global(.page) {
    background: #fff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
    flex-shrink: 0;
  }
</style>
