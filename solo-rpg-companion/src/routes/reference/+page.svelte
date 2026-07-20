<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import PdfViewer from "$lib/PdfViewer.svelte";

  // this route only renders inside a ref-* window spawned by the main page;
  // the doc identity travels in the query string (ssr is off app-wide)
  const params = new URLSearchParams(window.location.search);
  const path = params.get("path") ?? "";
  const name = params.get("name") ?? "Reference";

  let bytes = $state<Uint8Array | null>(null);
  // true from load start until the viewer renders page 1 (or the load fails)
  let loading = $state(true);
  let error = $state("");
  let viewer: PdfViewer | undefined = $state();
  let viewerReady = $state(false);
  let spreadOn = $state(false);

  async function load() {
    error = "";
    loading = true;
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      // a retry needs a fresh read — the previous buffer was transferred
      // (detached) to the pdf.js worker
      bytes = await readFile(path);
    } catch {
      error = `Couldn't read “${name}” — the file may be missing or locked.`;
      loading = false;
      bytes = null;
    }
  }
  void load();

  function onViewerReady() {
    loading = false;
    viewerReady = true;
  }

  function onViewerError(message: string) {
    error = message;
    loading = false;
    viewerReady = false;
    bytes = null;
  }

  function toggleSpread() {
    spreadOn = !spreadOn;
    viewer?.setSpread(spreadOn);
  }

  // poll the viewer for chrome display (same approach as the book window)
  let pageNum = $state(1);
  let pageTotal = $state(0);
  const poll = setInterval(() => {
    if (viewer && bytes) {
      const { current, total } = viewer.pageInfo();
      pageNum = current;
      pageTotal = total;
    }
  }, 250);
  onDestroy(() => clearInterval(poll));

  // this window is a plain OS window: native titlebar owns close; Escape is a
  // keyboard shortcut for the same thing
  async function closeWindow() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") void closeWindow();
  }

  // re-fit the pages when the user resizes the window
  let raf = 0;
  function onResize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => viewer?.refit());
  }

  onMount(() => () => cancelAnimationFrame(raf));
</script>

<svelte:head>
  <title>{name}</title>
</svelte:head>

<svelte:window onresize={onResize} onkeydown={onKeydown} />

<main>
  {#if error}
    <div class="pane-error">
      <p class="error">{error}</p>
      <button class="quiet" onclick={() => void load()}>Try again</button>
    </div>
  {:else}
    {#if bytes}
      <PdfViewer bind:this={viewer} data={bytes} perfLog={false} onready={onViewerReady} onerror={onViewerError} />
    {/if}
    {#if loading}
      <div class="pane-loading">
        <div class="skeleton" role="status" aria-label="Loading reference"></div>
      </div>
    {/if}
    {#if viewerReady}
      <div class="chrome bottom" role="toolbar" aria-label="Reference viewing controls">
        <button class="act" onclick={() => viewer?.zoomOut()} title="Zoom out" aria-label="Zoom out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2M8.5 11h5" />
          </svg>
        </button>
        <button class="act" onclick={() => viewer?.setZoom(100)} title="Fit width" aria-label="Fit width">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
          </svg>
        </button>
        <button class="act" onclick={() => viewer?.zoomIn()} title="Zoom in" aria-label="Zoom in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2M8.5 11h5M11 8.5v5" />
          </svg>
        </button>
        <button
          class="act"
          class:active={spreadOn}
          onclick={toggleSpread}
          title={spreadOn ? "Single page view" : "Two-page book view"}
          aria-label="Toggle two-page spread"
          aria-pressed={spreadOn}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 6c-1.6-1.3-3.8-2-6.5-2H4v14h1.5c2.7 0 4.9.7 6.5 2 1.6-1.3 3.8-2 6.5-2H20V4h-1.5c-2.7 0-4.9.7-6.5 2Z" /><path d="M12 6v14" />
          </svg>
        </button>
        <div class="divider"></div>
        <span class="pages">{pageNum} / {pageTotal}</span>
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    background: #262220;
  }

  /* opaque overlay so a retry-in-progress hides any stale canvas */
  .pane-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #262220;
  }

  /* page-shaped placeholder while the reference loads */
  .skeleton {
    width: min(46vh, 60vw);
    aspect-ratio: 3 / 4;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton { animation: none; opacity: 0.8; }
  }

  .pane-error {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 1.5rem;
  }
  .error {
    color: #e0897f; /* matches the main window's error red */
    font-size: 0.85rem;
    margin: 0 0 1rem;
    max-width: 46ch;
    text-align: center;
  }

  .quiet {
    background: none;
    border: 0;
    color: #e8e2d5;
    font: 600 0.9rem/1 inherit;
    font-family: inherit;
    padding: 0.45rem 0.7rem;
    border-radius: 8px;
    cursor: pointer;
  }
  .quiet:hover { background: rgba(255, 255, 255, 0.08); }
  .quiet:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }

  /* low-opacity floating toolbar, matching the main window's bottom chrome */
  .chrome {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    border-radius: 12px;
    background: rgba(28, 24, 21, 0.82);
    backdrop-filter: blur(6px);
    opacity: 0.35;
    transition: opacity 0.15s;
  }
  .chrome:hover { opacity: 1; }
  .chrome:focus-within { opacity: 1; }
  .chrome.bottom {
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    gap: 4px;
    padding: 8px;
    border-radius: 26px;
    border: 1px solid rgba(232, 226, 213, 0.07);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  }
  @media (prefers-reduced-motion: reduce) {
    .chrome { transition: none; }
  }

  .divider {
    width: 1px;
    align-self: stretch;
    margin: 6px 3px;
    background: rgba(232, 226, 213, 0.12);
  }

  .pages {
    color: #9c9384;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
    padding: 0 10px 0 4px;
    white-space: nowrap;
  }

  .act {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 18px;
    background: none;
    color: #9c9384;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .act svg { width: 20px; height: 20px; display: block; }
  .act:hover { background: rgba(255, 255, 255, 0.08); color: #e8e2d5; }
  .act.active { background: rgba(201, 163, 92, 0.22); color: #e4c37e; }
  .act:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .act { transition: none; }
  }
</style>
