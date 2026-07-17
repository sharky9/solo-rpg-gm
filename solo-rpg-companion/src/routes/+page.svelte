<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { readFile } from "@tauri-apps/plugin-fs";
  import { onDestroy } from "svelte";
  import PdfViewer from "$lib/PdfViewer.svelte";
  import DiceTray from "$lib/DiceTray.svelte";
  import CoinFlip from "$lib/CoinFlip.svelte";
  import CardDeck from "$lib/CardDeck.svelte";
  import TarotDeck from "$lib/TarotDeck.svelte";
  import BookmarkRail from "$lib/BookmarkRail.svelte";
  import AudioPlayer from "$lib/AudioPlayer.svelte";
  import * as perf from "$lib/perf";

  type Tool = "dice" | "coin" | "cards" | "tarot" | "audio";

  let pdfData: Uint8Array | null = $state(null);
  let bookName = $state("");
  let bookPath = $state("");
  // true from the moment a pick resolves until page 1 renders (or the load fails)
  let loading = $state(false);
  // true while the *displayed* document is readable — gates chrome/rail so a
  // re-open doesn't unmount controls floating over the still-visible old book
  let viewerReady = $state(false);
  let loadError = $state("");
  let openSeq = 0; // a newer pick supersedes any load still in flight
  let viewer: PdfViewer | undefined = $state();
  let spreadOn = $state(false);
  // the tools share the spot above the chrome — one open at a time
  let activeTool = $state<Tool | null>(null);

  function toggleTool(tool: Tool) {
    activeTool = activeTool === tool ? null : tool;
  }

  function toggleSpread() {
    spreadOn = !spreadOn;
    viewer?.setSpread(spreadOn);
  }

  // poll the viewer for chrome display (cheap; avoids cross-component stores for now)
  let pageLabel = $state("");
  let pageNum = $state(1);
  let pageTotal = $state(0);
  const poll = setInterval(() => {
    if (viewer && pdfData) {
      const { current, total } = viewer.pageInfo();
      pageLabel = total ? `${current} / ${total}` : "";
      pageNum = current;
      pageTotal = total;
    }
  }, 250);
  onDestroy(() => clearInterval(poll));

  async function openBook() {
    const path = await open({
      title: "Open a gamebook",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      multiple: false,
    });
    if (typeof path !== "string") return;
    const seq = ++openSeq;
    const name = path.split(/[\\/]/).pop()?.replace(/\.pdf$/i, "") ?? "Untitled";
    loadError = "";
    loading = true;
    perf.beginLoad();

    let bytes: Uint8Array;
    try {
      bytes = await readFile(path);
    } catch {
      if (seq !== openSeq) return; // superseded by a newer pick
      // a working book stays open on a failed re-open; first opens fall back
      loadError = `Couldn't read “${name}” — the file may be missing or locked.`;
      loading = false;
      return;
    }
    if (seq !== openSeq) return;
    perf.mark("file-read");

    // late-swap: data, path, and title change together, only once the read
    // succeeded, so the chrome never names a book that isn't loading
    viewerReady = false;
    pdfData = bytes;
    bookPath = path;
    bookName = name;
  }

  function onViewerReady() {
    loading = false;
    viewerReady = true;
  }

  function onViewerError(message: string) {
    // parse/render failure: the previous document is already torn down,
    // so fall back to the empty state with the error inline
    loadError = message;
    loading = false;
    viewerReady = false;
    pdfData = null;
    bookPath = "";
    bookName = "";
  }
</script>

<main>
  {#if pdfData}
    <PdfViewer bind:this={viewer} data={pdfData} onready={onViewerReady} onerror={onViewerError} />
    <div class="chrome top">
      <button class="quiet" onclick={openBook} title="Open another gamebook">Open</button>
      <span class="title">{bookName}</span>
      {#if loading}<span class="loading-note">Loading…</span>{/if}
      {#if loadError && !loading}<span class="error">{loadError}</span>{/if}
    </div>
    {#if viewerReady}
    <div class="chrome bottom">
      <button class="quiet" onclick={() => viewer?.zoomOut()} aria-label="Zoom out">−</button>
      <button class="quiet" onclick={() => viewer?.setZoom(100)} title="Fit width">Fit</button>
      <button class="quiet" onclick={() => viewer?.zoomIn()} aria-label="Zoom in">+</button>
      <button
        class="quiet"
        class:active={spreadOn}
        onclick={toggleSpread}
        title={spreadOn ? "Single page view" : "Two-page book view"}
      >Spread</button>
      <button
        class="quiet"
        class:active={activeTool === "dice"}
        onclick={() => toggleTool("dice")}
        title={activeTool === "dice" ? "Put the dice away" : "Bring out the dice"}
      >Dice</button>
      <button
        class="quiet"
        class:active={activeTool === "coin"}
        onclick={() => toggleTool("coin")}
        title={activeTool === "coin" ? "Put the coin away" : "Bring out the coin"}
      >Coin</button>
      <button
        class="quiet"
        class:active={activeTool === "cards"}
        onclick={() => toggleTool("cards")}
        title={activeTool === "cards" ? "Put the cards away" : "Bring out the cards"}
      >Cards</button>
      <button
        class="quiet"
        class:active={activeTool === "tarot"}
        onclick={() => toggleTool("tarot")}
        title={activeTool === "tarot" ? "Put the tarot away" : "Bring out the tarot"}
      >Tarot</button>
      <button
        class="quiet"
        class:active={activeTool === "audio"}
        onclick={() => toggleTool("audio")}
        title={activeTool === "audio" ? "Close the audio drawer" : "Open the audio drawer"}
      >Audio</button>
      <span class="pages">{pageLabel}</span>
    </div>
    {/if}
    <DiceTray open={activeTool === "dice"} onclose={() => (activeTool = null)} />
    <CoinFlip open={activeTool === "coin"} onclose={() => (activeTool = null)} />
    <CardDeck open={activeTool === "cards"} onclose={() => (activeTool = null)} />
    <TarotDeck open={activeTool === "tarot"} onclose={() => (activeTool = null)} />
    <AudioPlayer open={activeTool === "audio"} onclose={() => (activeTool = null)} />
    {#if viewerReady}
      <BookmarkRail
        bookKey={bookPath}
        currentPage={pageNum}
        spread={spreadOn}
        totalPages={pageTotal}
        onjump={(p) => viewer?.goToPage(p)}
      />
    {/if}
  {:else}
    <div class="empty">
      {#if loading}
        <div class="skeleton" role="status" aria-label="Loading book"></div>
      {:else}
        <h1>Solo RPG Companion</h1>
        <p>Open a gamebook to lay the table.</p>
        {#if loadError}<p class="error">{loadError}</p>{/if}
        <button class="primary" onclick={openBook}>Open a PDF</button>
      {/if}
    </div>
  {/if}
</main>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    background: #262220;
    color: #e8e2d5;
    font: 15px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
  }
  main {
    position: fixed;
    inset: 0;
  }

  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
  .empty h1 {
    font-family: Georgia, serif;
    font-weight: 600;
    margin: 0;
  }
  .empty p {
    color: #9c9384;
    margin: 0 0 1.2rem;
  }

  /* page-shaped placeholder while the book loads */
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

  .loading-note {
    color: #9c9384;
    font-size: 0.85rem;
    padding-right: 0.6rem;
  }
  .error {
    color: #e0897f; /* matches AudioPlayer's error red */
    font-size: 0.85rem;
    margin: 0 0 1rem;
    max-width: 46ch;
    text-align: center;
  }
  .chrome .error {
    margin: 0;
    padding-right: 0.6rem;
    max-width: 40vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .primary {
    background: #c9a35c;
    color: #241d10;
    border: 0;
    border-radius: 10px;
    padding: 0.7rem 1.4rem;
    font: 700 1rem/1 inherit;
    font-family: inherit;
    cursor: pointer;
  }
  .primary:hover { filter: brightness(1.08); }

  .chrome {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem;
    border-radius: 12px;
    background: rgba(28, 24, 21, 0.82);
    backdrop-filter: blur(6px);
    opacity: 0.35;
    transition: opacity 0.15s;
  }
  .chrome:hover { opacity: 1; }
  .chrome.top { top: 12px; left: 12px; }
  .chrome.bottom { bottom: 12px; left: 50%; transform: translateX(-50%); }

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
  .quiet.active { background: rgba(201, 163, 92, 0.22); color: #e4c37e; }
  .quiet:focus-visible, .primary:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }

  .title {
    color: #9c9384;
    font-size: 0.85rem;
    padding-right: 0.6rem;
    max-width: 40vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pages {
    color: #9c9384;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    padding: 0 0.7rem;
  }
</style>
