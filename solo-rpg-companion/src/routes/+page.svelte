<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { readFile } from "@tauri-apps/plugin-fs";
  import { onDestroy } from "svelte";
  import PdfViewer from "$lib/PdfViewer.svelte";
  import DiceTray from "$lib/DiceTray.svelte";

  let pdfData: Uint8Array | null = $state(null);
  let bookName = $state("");
  let viewer: PdfViewer | undefined = $state();
  let spreadOn = $state(false);
  let diceOpen = $state(false);

  function toggleSpread() {
    spreadOn = !spreadOn;
    viewer?.setSpread(spreadOn);
  }

  // poll the viewer for chrome display (cheap; avoids cross-component stores for now)
  let pageLabel = $state("");
  const poll = setInterval(() => {
    if (viewer && pdfData) {
      const { current, total } = viewer.pageInfo();
      pageLabel = total ? `${current} / ${total}` : "";
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
    pdfData = await readFile(path);
    bookName = path.split("/").pop()?.replace(/\.pdf$/i, "") ?? "Untitled";
  }
</script>

<main>
  {#if pdfData}
    <PdfViewer bind:this={viewer} data={pdfData} />
    <div class="chrome top">
      <button class="quiet" onclick={openBook} title="Open another gamebook">Open</button>
      <span class="title">{bookName}</span>
    </div>
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
        class:active={diceOpen}
        onclick={() => (diceOpen = !diceOpen)}
        title={diceOpen ? "Put the dice away" : "Bring out the dice"}
      >Dice</button>
      <span class="pages">{pageLabel}</span>
    </div>
    <DiceTray open={diceOpen} onclose={() => (diceOpen = false)} />
  {:else}
    <div class="empty">
      <h1>Solo RPG Companion</h1>
      <p>Open a gamebook to lay the table.</p>
      <button class="primary" onclick={openBook}>Open a PDF</button>
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
