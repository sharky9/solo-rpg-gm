<script lang="ts">
  import * as pdfjs from "pdfjs-dist";
  import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
  import { onDestroy } from "svelte";
  import * as perf from "./perf";
  import { worker } from "./pdfWorker";

  let {
    data,
    onready,
    onerror,
  }: {
    data: Uint8Array;
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
    // destroying a task mid-flight can disturb others on the same port
    if (prev) await prev.destroy().catch(() => {});
  }

  async function load(bytes: Uint8Array) {
    const seq = ++loadSeq;
    await teardown();
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
    perf.mark("parse");
    numPages = doc.numPages;
    currentPage = 1;

    const first = await doc.getPage(1);
    if (seq !== loadSeq) return;
    const base = first.getViewport({ scale: 1 });
    baseW = base.width;
    baseH = base.height;

    buildLayout();
    perf.mark("placeholders");
  }

  // rows and placeholders from the already-parsed doc; also the spread-toggle
  // path, which must never re-parse (the source buffer is detached)
  function buildLayout() {
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
    for (let i = 1; i <= numPages; i++) {
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
      io.observe(el);
    }
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
    if (!slots[i - 1]) return; // torn down while awaiting

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
      if (i === 1) {
        perf.mark("first-render");
        perf.summarize();
        onready?.();
      }
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
    buildLayout(); // rebuild rows from the parsed doc; zoomPct preserved
    goToPage(anchor);
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
