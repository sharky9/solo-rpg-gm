<script lang="ts">
  import {
    type Bookmark,
    type BookmarkColor,
    loadBookmarks,
    saveBookmarks,
  } from "./bookmarks";

  let {
    bookKey,
    currentPage,
    spread = false,
    totalPages = 0,
    onjump,
  }: {
    bookKey: string;
    currentPage: number;
    spread?: boolean;
    totalPages?: number;
    onjump?: (page: number) => void;
  } = $props();

  // in spread view a bookmark could mean either facing page (cover sits alone,
  // then 2-3, 4-5, …) — offer both and let the player pick the side they mean
  const markablePages = $derived.by(() => {
    if (!spread || currentPage <= 1) return [currentPage];
    const left = currentPage % 2 === 0 ? currentPage : currentPage - 1;
    const pages = [left];
    if (!totalPages || left + 1 <= totalPages) pages.push(left + 1);
    return pages;
  });

  const COLORS: BookmarkColor[] = ["red", "blue", "green"];

  let bookmarks = $state<Bookmark[]>([]);
  let adding = $state(false);
  let newColor = $state<BookmarkColor>("red");
  let newLabel = $state("");
  let editing = $state<Bookmark | null>(null);
  let editLabel = $state("");

  // load this book's bookmarks whenever the book changes
  $effect(() => {
    const key = bookKey;
    loadBookmarks(key).then((list) => {
      if (key === bookKey) bookmarks = list;
    });
  });

  function persist() {
    saveBookmarks(bookKey, $state.snapshot(bookmarks));
  }

  function add(page: number) {
    bookmarks.push({
      page,
      color: newColor,
      label: newLabel.trim() || undefined,
    });
    bookmarks.sort((a, b) => a.page - b.page);
    persist();
    adding = false;
    newLabel = "";
  }

  function remove(b: Bookmark) {
    bookmarks = bookmarks.filter((x) => x !== b);
    persist();
  }

  function startRename(b: Bookmark) {
    editing = b;
    editLabel = b.label ?? "";
  }

  function saveRename() {
    if (!editing) return;
    editing.label = editLabel.trim() || undefined;
    editing = null;
    persist();
  }

  // lets the page's Escape coordinator yield to the rail while the
  // add-bookmark popover or rename editor is up (they hold keyboard focus)
  export function isEditing() {
    return adding || editing !== null;
  }

  // the coordinator dismisses the popover/rename itself (with stopPropagation),
  // so exactly one layer closes per press even with a tool drawer also open
  export function cancelEditing() {
    editing = null;
    adding = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (editing) {
      e.preventDefault();
      editing = null;
    } else if (adding) {
      e.preventDefault();
      adding = false;
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="rail" aria-label="Bookmarks">
  <button
    class="add"
    class:open={adding}
    onclick={() => (adding = !adding)}
    title={adding ? "Cancel" : "Bookmark this page"}
    aria-label={adding ? "Cancel adding bookmark" : "Bookmark this page"}
  >{adding ? "×" : "+"}</button>

  {#if adding}
    <div class="add-pop">
      <div class="swatches" role="radiogroup" aria-label="Bookmark color">
        {#each COLORS as c}
          <button
            class="swatch {c}"
            class:picked={newColor === c}
            onclick={() => (newColor = c)}
            role="radio"
            aria-checked={newColor === c}
            aria-label={c}
          ></button>
        {/each}
      </div>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        placeholder="Label (optional)"
        maxlength="24"
        bind:value={newLabel}
        autofocus
        onkeydown={(e) => e.key === "Enter" && add(markablePages[0])}
      />
      <div class="confirm-row">
        {#if markablePages.length > 1}
          <button class="confirm" onclick={() => add(markablePages[0])}>Mark left</button>
          <button class="confirm" onclick={() => add(markablePages[1])}>Mark right</button>
        {:else}
          <button class="confirm" onclick={() => add(markablePages[0])}>Mark this page</button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="tabs">
    {#each bookmarks as b (b)}
      <div class="tab {b.color}" class:editing={editing === b}>
        {#if editing === b}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="rename"
            placeholder="Name this bookmark"
            maxlength="24"
            bind:value={editLabel}
            autofocus
            onkeydown={(e) => e.key === "Enter" && saveRename()}
            onblur={saveRename}
          />
        {:else}
          <button
            class="jump"
            onclick={() => onjump?.(b.page)}
            title={b.label || "Bookmark"}
          >
            <span class="grip">❧</span>
            {#if b.label}<span class="lbl">{b.label}</span>{/if}
          </button>
          <button class="edit" onclick={() => startRename(b)} aria-label="Name bookmark">✎</button>
          <button class="del" onclick={() => remove(b)} aria-label="Remove bookmark">×</button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .rail {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-start;
    padding: 56px 0 72px;
    gap: 0.5rem;
    pointer-events: none; /* only the tabs themselves catch clicks */
    z-index: 5;
  }
  .rail > *,
  .tabs > * {
    pointer-events: auto;
  }

  .add {
    width: 30px;
    height: 30px;
    margin-right: 8px;
    border-radius: 8px;
    border: 1.5px solid rgba(156, 147, 132, 0.45);
    background: rgba(28, 24, 21, 0.82);
    backdrop-filter: blur(6px);
    color: #e8e2d5;
    font: 700 1rem/1 inherit;
    font-family: inherit;
    cursor: pointer;
    opacity: 0.45;
    transition: opacity 0.15s;
  }
  .add:hover,
  .add.open {
    opacity: 1;
    border-color: #c9a35c;
  }
  .add:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
    opacity: 1;
  }

  .add-pop {
    margin-right: 8px;
    background: rgba(28, 24, 21, 0.94);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(232, 226, 213, 0.12);
    border-radius: 12px;
    padding: 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    width: 168px;
  }
  .swatches {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }
  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .swatch.red { background: #a8443c; }
  .swatch.blue { background: #3f6a99; }
  .swatch.green { background: #3f7d5c; }
  .swatch.picked {
    border-color: #e8e2d5;
  }
  .swatch:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }
  .add-pop input {
    background: rgba(232, 226, 213, 0.08);
    border: 1px solid rgba(156, 147, 132, 0.4);
    border-radius: 7px;
    color: #e8e2d5;
    font: 0.85rem/1.3 inherit;
    font-family: inherit;
    padding: 0.4rem 0.5rem;
  }
  .add-pop input:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 1px;
  }
  .confirm-row {
    display: flex;
    gap: 0.45rem;
  }
  .confirm {
    flex: 1;
    border-radius: 7px;
    border: 0;
    background: #c9a35c;
    color: #241d10;
    font: 700 0.85rem/1 inherit;
    font-family: inherit;
    padding: 0.5rem;
    cursor: pointer;
  }
  .confirm:hover {
    filter: brightness(1.08);
  }
  .confirm:focus-visible {
    outline: 2px solid #e8e2d5;
    outline-offset: 2px;
  }

  .tabs {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .tab {
    display: flex;
    align-items: center;
    border-radius: 8px 0 0 8px;
    color: #fdf9ef;
    max-width: 40px;
    transition: max-width 0.18s ease;
    overflow: hidden;
    opacity: 0.85;
  }
  .tab:hover,
  .tab:focus-within,
  .tab.editing {
    max-width: 240px;
    opacity: 1;
  }
  .tab.red { background: #a8443c; }
  .tab.blue { background: #3f6a99; }
  .tab.green { background: #3f7d5c; }

  .jump {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    border: 0;
    background: none;
    color: inherit;
    font-family: inherit;
    padding: 0.4rem 0.2rem 0.4rem 0.7rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .grip {
    font-size: 0.85rem;
  }
  .lbl {
    font-size: 0.8rem;
    opacity: 0.9;
  }
  .rename {
    background: rgba(0, 0, 0, 0.25);
    border: 0;
    border-radius: 6px;
    color: inherit;
    font: 0.8rem/1.3 inherit;
    font-family: inherit;
    padding: 0.35rem 0.5rem;
    margin: 0.25rem 0.4rem;
    width: 150px;
  }
  .rename::placeholder {
    color: rgba(253, 249, 239, 0.55);
  }
  .rename:focus-visible {
    outline: 2px solid #fdf9ef;
    outline-offset: 1px;
  }
  .edit {
    border: 0;
    background: none;
    color: inherit;
    font: 0.8rem/1 inherit;
    font-family: inherit;
    padding: 0.4rem 0.3rem;
    cursor: pointer;
    opacity: 0.7;
  }
  .edit:hover {
    opacity: 1;
  }
  .del {
    border: 0;
    background: none;
    color: inherit;
    font: 700 0.9rem/1 inherit;
    font-family: inherit;
    padding: 0.4rem 0.55rem 0.4rem 0.25rem;
    cursor: pointer;
    opacity: 0.7;
  }
  .del:hover {
    opacity: 1;
  }
  .jump:focus-visible,
  .edit:focus-visible,
  .del:focus-visible {
    outline: 2px solid #fdf9ef;
    outline-offset: -2px;
    border-radius: 6px;
  }
</style>
