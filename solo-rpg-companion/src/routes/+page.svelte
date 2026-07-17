<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { readFile } from "@tauri-apps/plugin-fs";
  import { onDestroy, onMount } from "svelte";
  import PdfViewer from "$lib/PdfViewer.svelte";
  import DiceTray from "$lib/DiceTray.svelte";
  import CoinFlip from "$lib/CoinFlip.svelte";
  import CardDeck from "$lib/CardDeck.svelte";
  import TarotDeck from "$lib/TarotDeck.svelte";
  import BookmarkRail from "$lib/BookmarkRail.svelte";
  import AudioPlayer from "$lib/AudioPlayer.svelte";
  import ReferencePane from "$lib/ReferencePane.svelte";
  import ReferenceFan from "$lib/ReferenceFan.svelte";
  import { refDocName, type RefDoc } from "$lib/referenceDocs";
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
  let rail: BookmarkRail | undefined = $state();
  let spreadOn = $state(false);
  // the tools share the spot above the chrome — one open at a time
  let activeTool = $state<Tool | null>(null);
  // the reference doc shown in the pane; its failures never touch book state.
  // While one is open, the book pane narrows to ~55% (split reader).
  let refDoc = $state<RefDoc | null>(null);
  let splitOpen = $derived(refDoc !== null);
  // the paper-stack fan of this book's reference documents
  let fanOpen = $state(false);

  function toggleTool(tool: Tool) {
    activeTool = activeTool === tool ? null : tool;
  }

  // refit after the pane width lands — the viewer reads clientWidth directly
  function scheduleRefit() {
    requestAnimationFrame(() => viewer?.refit());
  }

  function openReference(doc: RefDoc) {
    refDoc = doc;
    scheduleRefit();
  }

  function closeReference() {
    refDoc = null;
    scheduleRefit();
  }

  // reselecting the open doc just dismisses the fan — no reload (R19)
  function onFanSelect(doc: RefDoc) {
    fanOpen = false;
    if (doc.path !== refDoc?.path) openReference(doc);
  }

  // removing the doc that's open in the pane also closes the pane (R19)
  function onFanRemove(path: string) {
    if (path === refDoc?.path) closeReference();
  }

  // safety net: the split and fan can't outlive a readable book (R17). The
  // authoritative close on book-swap happens in openBook's late-swap block;
  // this catches any other path that drops viewerReady (same values — no fight).
  $effect(() => {
    if (!viewerReady && (refDoc || fanOpen)) {
      refDoc = null;
      fanOpen = false;
    }
  });

  // One Escape owner (R16): dismisses exactly one layer per press — the fan
  // first (its backdrop covers everything), then the bookmark rail's
  // popover/rename, then the open tool drawer, then the split pane. The
  // coordinator cancels the rail edit itself rather than letting the press
  // propagate: a propagated Escape reaches every tool's window listener too
  // and would dismiss two layers at once. Registered on the CAPTURE phase so
  // it runs before those bubble-phase listeners — stopPropagation() below is
  // what prevents a double-dismiss. (Capture isn't expressible via
  // <svelte:window> attributes.)
  function onEscapeCapture(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (fanOpen) {
      fanOpen = false;
    } else if (rail?.isEditing()) {
      rail.cancelEditing();
    } else if (activeTool) {
      activeTool = null;
    } else if (splitOpen) {
      closeReference();
    } else {
      return; // nothing open — the tools' listeners are gated on `open` anyway
    }
    e.preventDefault();
    e.stopPropagation();
  }

  onMount(() => {
    window.addEventListener("keydown", onEscapeCapture, true);
    return () => window.removeEventListener("keydown", onEscapeCapture, true);
  });

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
    const name = refDocName(path) || "Untitled";
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
    // succeeded, so the chrome never names a book that isn't loading. The fan
    // and split belong to the outgoing book, so they close here too (R18) —
    // a cancelled dialog or failed read above never touches them.
    viewerReady = false;
    fanOpen = false;
    refDoc = null;
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
    <!-- the book viewer must never remount — its buffer is transferred to the
         pdf.js worker, so a recreate would re-load a detached buffer and fail.
         The split only ever changes this pane's width. -->
    <div class="book-pane" class:split={splitOpen}>
      <PdfViewer bind:this={viewer} data={pdfData} onready={onViewerReady} onerror={onViewerError} />
      {#if viewerReady}
        <BookmarkRail
          bind:this={rail}
          bookKey={bookPath}
          currentPage={pageNum}
          spread={spreadOn}
          totalPages={pageTotal}
          onjump={(p) => viewer?.goToPage(p)}
        />
        <!-- paper-stack: anchored to this pane's corner so it rides the divider
             and never sits over the reference pane -->
        <button
          class="stack"
          class:active={fanOpen}
          onclick={() => (fanOpen = !fanOpen)}
          title={fanOpen ? "Put the references away" : "Fan out the references"}
          aria-label={fanOpen ? "Close reference documents" : "Open reference documents"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="3" width="12" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <rect x="4" y="6.5" width="12" height="15" rx="1.5" fill="#262220" stroke="currentColor" stroke-width="1.6" />
          </svg>
        </button>
      {/if}
    </div>
    {#if refDoc}
      <div class="reference-pane">
        <ReferencePane path={refDoc.path} name={refDoc.name} onclose={closeReference} />
      </div>
    {/if}
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
    <ReferenceFan
      bookKey={bookPath}
      open={fanOpen}
      onselect={onFanSelect}
      onclose={() => (fanOpen = false)}
      onremove={onFanRemove}
    />
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

  /* book pane: the rail's positioned ancestor, so its right-edge tabs land on
     the divider when split. No width transition — refit() reads clientWidth
     right after the toggle, and a mid-animation width would mis-fit. */
  .book-pane {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 100%;
  }
  .book-pane.split {
    width: 55%;
  }
  .reference-pane {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 45%;
  }

  /* paper-stack icon: low-opacity chrome pinned to the book pane's corner */
  .stack {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 0;
    background: rgba(28, 24, 21, 0.82);
    backdrop-filter: blur(6px);
    color: #e8e2d5;
    cursor: pointer;
    opacity: 0.35;
    transition: opacity 0.15s;
    z-index: 6;
  }
  .stack svg {
    width: 20px;
    height: 20px;
  }
  .stack:hover,
  .stack.active {
    opacity: 1;
  }
  .stack.active {
    color: #e4c37e;
    background: rgba(201, 163, 92, 0.22);
  }
  .stack:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .stack { transition: none; }
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
