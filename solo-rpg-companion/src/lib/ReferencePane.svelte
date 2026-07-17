<script lang="ts">
  import PdfViewer from "./PdfViewer.svelte";

  let {
    path,
    name,
    onclose,
  }: {
    path: string;
    name: string;
    onclose: () => void;
  } = $props();

  let bytes = $state<Uint8Array | null>(null);
  // true from path change until the viewer renders page 1 (or the load fails)
  let loading = $state(false);
  // pane-scoped (R15): a reference that fails to read or parse shows its error
  // here and never touches the book's state
  let error = $state("");
  let openSeq = 0; // a newer path supersedes any read still in flight
  let bytesSeq = 0; // which selection the mounted viewer's callbacks belong to

  $effect(() => {
    void openDoc(path, name);
  });

  async function openDoc(p: string, docName: string) {
    const seq = ++openSeq;
    error = ""; // a fresh selection clears a previous doc's failure
    loading = true;

    let read: Uint8Array;
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      read = await readFile(p);
    } catch {
      if (seq !== openSeq) return; // superseded by a newer selection
      error = `Couldn't read “${docName}” — the file may be missing or locked.`;
      loading = false;
      bytes = null;
      return;
    }
    if (seq !== openSeq) return;
    // swapping data reuses the mounted viewer — its load() tears down the old doc
    bytes = read;
    bytesSeq = seq;
  }

  // both callbacks report on the last bytes handed over; a late signal from an
  // outgoing document must not clobber a newer selection still reading (R15)
  function onViewerReady() {
    if (bytesSeq !== openSeq) return;
    loading = false;
  }

  function onViewerError(message: string) {
    if (bytesSeq !== openSeq) return;
    error = message;
    loading = false;
    bytes = null;
  }
</script>

<div class="pane">
  {#if error}
    <div class="pane-error">
      <p class="error">{error}</p>
      <button class="quiet" onclick={() => void openDoc(path, name)}>Try again</button>
      <button class="quiet" onclick={onclose}>Close</button>
    </div>
  {:else}
    {#if bytes}
      <PdfViewer data={bytes} perfLog={false} onready={onViewerReady} onerror={onViewerError} />
    {/if}
    {#if loading}
      <div class="pane-loading">
        <div class="skeleton" role="status" aria-label="Loading reference"></div>
      </div>
    {/if}
  {/if}
  <div class="chrome">
    <span class="doc-name">{name}</span>
    <button class="quiet" onclick={onclose} aria-label="Close reference">✕</button>
  </div>
</div>

<style>
  .pane {
    position: absolute;
    inset: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    background: #262220;
  }

  /* minimal chrome: name + close, matching the page's low-opacity bars */
  .chrome {
    position: absolute;
    top: 12px;
    right: 12px;
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
  @media (prefers-reduced-motion: reduce) {
    .chrome { transition: none; }
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

  .doc-name {
    color: #9c9384;
    font-size: 0.85rem;
    padding-left: 0.6rem;
    max-width: 24vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* opaque overlay so a swap-in-progress hides the outgoing document */
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
    width: min(46vh, 60%);
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
    color: #e0897f; /* matches the page's error red */
    font-size: 0.85rem;
    margin: 0 0 1rem;
    max-width: 46ch;
    text-align: center;
  }
</style>
