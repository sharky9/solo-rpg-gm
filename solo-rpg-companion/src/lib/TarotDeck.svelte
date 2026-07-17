<script lang="ts">
  import { onDestroy } from "svelte";

  let { open = false, onclose }: { open?: boolean; onclose?: () => void } = $props();

  type TarotCard = {
    name: string;
    numeral?: string; // majors only
    rank?: string; // minors only
    suit?: string; // minors only
    reversed: boolean;
  };

  const MAJORS = [
    "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
    "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
    "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
    "The Devil", "The Tower", "The Star", "The Moon", "The Sun",
    "Judgement", "The World",
  ];
  const NUMERALS = [
    "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI",
    "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
  ];
  const SUITS = ["Wands", "Cups", "Swords", "Pentacles"];
  const RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];

  let deck = $state<TarotCard[]>([]); // remaining; the end of the array is the top
  let drawn = $state<TarotCard[]>([]); // draw order; last entry is on show
  let withReversals = $state(true);
  let flipping = $state(false);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  onDestroy(() => {
    for (const t of timers) clearTimeout(t);
  });

  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function randomInt(maxExclusive: number): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }

  function shuffle() {
    if (flipping) return;
    const cards: TarotCard[] = [];
    MAJORS.forEach((name, i) => cards.push({ name, numeral: NUMERALS[i], reversed: false }));
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ name: `${rank} of ${suit}`, rank, suit, reversed: false });
    // Fisher–Yates with crypto RNG; orientation is part of the shuffle, so the
    // entire deck — order and reversals — exists before any card is revealed
    for (let i = cards.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    if (withReversals) for (const c of cards) c.reversed = randomInt(2) === 1;
    deck = cards;
    drawn = [];
  }

  shuffle();

  function draw() {
    if (!deck.length || flipping) return;
    const card = deck.pop()!; // result first: card and orientation pre-decided
    deck = deck;
    drawn.push(card);
    if (!reduced) {
      flipping = true;
      const t = setTimeout(() => {
        timers.delete(t);
        flipping = false;
      }, 420);
      timers.add(t);
    }
  }

  const current = $derived(drawn.length ? drawn[drawn.length - 1] : null);

  function cardLabel(c: TarotCard): string {
    const base = c.numeral !== undefined ? `${c.name} (${c.numeral})` : c.name;
    return c.reversed ? `${base} — Reversed` : base;
  }

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      e.preventDefault();
      onclose?.();
    }
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <section class="tarot-deck" aria-label="Tarot deck">
    <div class="table-row">
      <button
        class="pile"
        class:empty={deck.length === 0}
        onclick={draw}
        disabled={deck.length === 0}
        aria-label={deck.length
          ? `Draw a card. ${deck.length} remaining.`
          : "Deck empty. Shuffle to reset."}
      >
        {#if deck.length}
          <div class="back"><span class="back-mark">✶</span></div>
        {:else}
          <span class="empty-hint">empty</span>
        {/if}
      </button>

      <div class="slot">
        {#if current}
          {#key drawn.length}
            <div
              class="card"
              class:flip={!reduced}
              aria-label={cardLabel(current)}
            >
              <div class="face" class:reversed={current.reversed}>
                {#if current.numeral !== undefined}
                  <span class="numeral">{current.numeral}</span>
                  <span class="title">{current.name}</span>
                {:else}
                  <span class="numeral">{current.rank}</span>
                  <span class="title">of {current.suit}</span>
                {/if}
              </div>
            </div>
          {/key}
        {:else}
          <div class="card placeholder"></div>
        {/if}
      </div>
    </div>

    <div class="status" aria-live="polite">
      {#if current}
        <span class="name">{cardLabel(current)}</span>
      {:else}
        <span class="name muted">Tap the deck to draw</span>
      {/if}
      <span class="counts">{deck.length} left · {drawn.length} drawn</span>
    </div>

    <div class="actions">
      <button class="shuffle" onclick={shuffle}>Shuffle</button>
      <label class="reversals">
        <input type="checkbox" bind:checked={withReversals} />
        Reversals <span class="hint">(next shuffle)</span>
      </label>
    </div>
  </section>
{/if}

<style>
  .tarot-deck {
    position: absolute;
    bottom: 64px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(28, 24, 21, 0.94);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(232, 226, 213, 0.12);
    border-radius: 16px;
    padding: 1.1rem 1.3rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
    z-index: 10;
  }

  .table-row {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .pile,
  .card,
  .placeholder {
    width: 92px;
    height: 150px;
    border-radius: 8px;
  }

  .pile {
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }
  .pile .back {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    background:
      radial-gradient(circle at center, rgba(201, 163, 92, 0.22) 0 18%, transparent 19%),
      #1e3d2f;
    border: 2px solid #c9a35c;
    box-shadow:
      2px 2px 0 rgba(46, 92, 68, 0.7),
      4px 4px 0 rgba(46, 92, 68, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .back-mark {
    color: #c9a35c;
    font-size: 1.6rem;
  }
  .pile:hover:not(:disabled) .back {
    filter: brightness(1.12);
  }
  .pile.empty {
    border: 1.5px dashed rgba(156, 147, 132, 0.4);
    cursor: default;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .empty-hint {
    color: #9c9384;
    font-size: 0.8rem;
  }

  .slot {
    perspective: 700px;
  }
  .card {
    background: #fffdf6;
    border: 1.5px solid #b5a98e;
    overflow: hidden;
  }
  .card .face {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.5rem;
    box-sizing: border-box;
    border: 1px solid rgba(181, 169, 142, 0.6);
    border-radius: 6px;
    box-shadow: inset 0 0 0 3px #fffdf6, inset 0 0 0 4px rgba(181, 169, 142, 0.35);
  }
  .card .face.reversed {
    transform: rotate(180deg);
  }
  .placeholder {
    background: none;
    border: 1.5px dashed rgba(156, 147, 132, 0.4);
  }

  .numeral {
    font-family: Georgia, serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: #2a241a;
  }
  .title {
    font-family: Georgia, serif;
    font-size: 0.8rem;
    text-align: center;
    line-height: 1.25;
    color: #5c5342;
  }

  @keyframes flip-in {
    from { transform: rotateY(-90deg); }
    to { transform: rotateY(0deg); }
  }
  .card.flip {
    animation: flip-in 0.42s cubic-bezier(0.3, 1.2, 0.5, 1);
    backface-visibility: hidden;
  }
  @media (prefers-reduced-motion: reduce) {
    .card.flip { animation: none; }
  }

  .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
  }
  .name {
    font-family: Georgia, serif;
    font-size: 1.05rem;
    color: #e8e2d5;
  }
  .name.muted {
    color: #9c9384;
    font-size: 0.9rem;
  }
  .counts {
    color: #9c9384;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }
  .shuffle {
    border-radius: 9px;
    border: 0;
    cursor: pointer;
    background: #c9a35c;
    color: #241d10;
    font: 700 0.9rem/1 inherit;
    font-family: inherit;
    padding: 0.55rem 1.4rem;
    letter-spacing: 0.04em;
  }
  .shuffle:hover {
    filter: brightness(1.08);
  }
  .shuffle:focus-visible,
  .pile:focus-visible,
  .reversals input:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }
  .pile:focus-visible {
    outline-offset: 3px;
  }

  .reversals {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #e8e2d5;
    font-size: 0.85rem;
    cursor: pointer;
    user-select: none;
  }
  .reversals input {
    accent-color: #c9a35c;
  }
  .reversals .hint {
    color: #9c9384;
    font-size: 0.75rem;
  }
</style>
