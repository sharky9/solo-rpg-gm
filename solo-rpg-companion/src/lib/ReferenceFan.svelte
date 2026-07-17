<script lang="ts">
  import { untrack } from "svelte";
  import { type RefDoc, loadRefDocs, refDocName, saveRefDocs } from "./referenceDocs";

  let {
    bookKey,
    open = false,
    onselect,
    onclose,
    onremove,
  }: {
    bookKey: string;
    open?: boolean;
    onselect: (doc: RefDoc) => void;
    onclose: () => void;
    onremove?: (path: string) => void;
  } = $props();

  // last-known list renders the instant the fan opens (no unbadged flash);
  // the store load and the missing-file probes then refresh it in place
  let docs = $state<RefDoc[]>([]);
  let missing = $state<Set<string>>(new Set());
  let loadSeq = 0; // a newer open/book supersedes loads and probes in flight
  let cardEls: (HTMLButtonElement | undefined)[] = $state([]);
  let addEl = $state<HTMLButtonElement | undefined>();

  // a different book's fan must never act on the old book's cached list —
  // clear it and supersede anything in flight the moment the key changes
  $effect(() => {
    bookKey;
    loadSeq++;
    docs = [];
    missing = new Set();
  });

  $effect(() => {
    if (!open) return;
    void refresh(bookKey);
  });

  // focus lands on the first card (or the add card when the set is empty)
  // when the fan opens; untrack so a late list refresh doesn't steal it back
  $effect(() => {
    // skip missing (disabled) cards — a disabled button can't take focus
    if (open) untrack(() => cardEls.find((el) => el && !el.disabled) ?? addEl)?.focus();
  });

  async function refresh(key: string) {
    const seq = ++loadSeq;
    const list = await loadRefDocs(key);
    if (seq !== loadSeq) return;
    docs = list;
    probeAll(list, seq); // not awaited — badges update in place, no spinner
  }

  function probeAll(list: RefDoc[], seq: number) {
    for (const doc of list) {
      void probeOne(doc.path).then((present) => {
        if (seq === loadSeq) setMissing(doc.path, !present);
      });
    }
  }

  async function probeOne(path: string): Promise<boolean> {
    let exists: typeof import("@tauri-apps/plugin-fs").exists;
    try {
      ({ exists } = await import("@tauri-apps/plugin-fs"));
    } catch {
      return true; // browser dev — no fs plugin, never block the fan (R12)
    }
    try {
      return await exists(path);
    } catch {
      // a rejected probe (e.g. outside the app's fs scope) would fail to read
      // on select anyway — badge it rather than promising a doc we can't open
      return false;
    }
  }

  function setMissing(path: string, isMissing: boolean) {
    if (missing.has(path) === isMissing) return;
    const next = new Set(missing); // reassign so the badge reacts
    if (isMissing) next.add(path);
    else next.delete(path);
    missing = next;
  }

  function remove(doc: RefDoc) {
    loadSeq++; // an in-flight refresh must not resurrect the removed card
    docs = docs.filter((d) => d.path !== doc.path);
    void saveRefDocs(bookKey, $state.snapshot(docs));
    onremove?.(doc.path);
  }

  async function addDocs() {
    let paths: string[];
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const picked = await openDialog({
        title: "Add reference documents",
        multiple: true,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!picked) return;
      paths = Array.isArray(picked) ? picked : [picked];
    } catch {
      return; // no dialog plugin (browser dev) — nothing to add
    }
    const known = new Set(docs.map((d) => d.path));
    const fresh = paths
      .filter((p) => !known.has(p))
      .map((p) => ({ name: refDocName(p) || "Untitled", path: p }));
    if (!fresh.length) return; // duplicates only — nothing changes (R19)
    docs = [...docs, ...fresh];
    void saveRefDocs(bookKey, $state.snapshot(docs));
    probeAll(fresh, loadSeq);
  }
</script>

{#if open}
  <button class="backdrop" onclick={onclose} aria-label="Dismiss references"></button>
  <div class="fan" role="dialog" aria-label="Reference documents">
    {#each docs as doc, i (doc.path)}
      <div
        class="card"
        class:missing={missing.has(doc.path)}
        style:--tilt="{(i - (docs.length - 1) / 2) * 1.5}deg"
      >
        <button
          class="pick"
          disabled={missing.has(doc.path)}
          onclick={() => onselect(doc)}
          bind:this={cardEls[i]}
        >
          <span class="doc-name">{doc.name}</span>
          {#if missing.has(doc.path)}<span class="badge">missing</span>{/if}
        </button>
        <button class="del" onclick={() => remove(doc)} aria-label={`Remove ${doc.name}`}>✕</button>
      </div>
    {/each}
    <div class="card add-card" style:--tilt="0deg">
      <button class="pick add" onclick={addDocs} bind:this={addEl}>Add documents…</button>
    </div>
  </div>
{/if}

<style>
  /* above the tool drawers (z-index 10) so the fan owns the screen */
  .backdrop {
    position: fixed;
    inset: 0;
    border: 0;
    padding: 0;
    background: rgba(20, 17, 15, 0.55);
    cursor: default;
    z-index: 20;
  }

  .fan {
    position: fixed;
    right: 24px;
    bottom: 64px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.45rem;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 147, 132, 0.5) transparent;
    z-index: 21;
  }

  .card {
    display: flex;
    align-items: center;
    background: rgba(28, 24, 21, 0.94);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(232, 226, 213, 0.12);
    border-radius: 12px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    transform: rotate(var(--tilt));
    transition: transform 0.12s ease;
  }
  .card:hover,
  .card:focus-within {
    transform: rotate(0deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      transform: none;
      transition: none;
    }
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: 0;
    background: none;
    color: #e8e2d5;
    font: 600 0.9rem/1.3 inherit;
    font-family: inherit;
    text-align: left;
    padding: 0.6rem 0.3rem 0.6rem 0.9rem;
    border-radius: 12px;
    cursor: pointer;
    max-width: 260px;
  }
  .pick:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
  }
  .pick:disabled {
    cursor: default;
  }
  .card.missing .doc-name {
    color: #9c9384;
    text-decoration: line-through;
  }
  .pick:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: -2px;
  }

  .doc-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    flex: none;
    color: #e0897f; /* matches the page's error red */
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid rgba(224, 137, 127, 0.5);
    border-radius: 6px;
    padding: 0.1rem 0.35rem;
  }

  .del {
    border: 0;
    background: none;
    color: #9c9384;
    font: 700 0.85rem/1 inherit;
    font-family: inherit;
    padding: 0.6rem 0.7rem 0.6rem 0.4rem;
    border-radius: 12px;
    cursor: pointer;
  }
  .del:hover {
    color: #e8e2d5;
  }
  .del:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: -2px;
  }

  .add-card .add {
    color: #e4c37e;
    padding: 0.6rem 0.9rem;
  }
</style>
