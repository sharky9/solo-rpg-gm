<script lang="ts">
  let { open = false, onclose }: { open?: boolean; onclose?: () => void } = $props();

  type Card = { rank: string; suit: string; red: boolean; joker?: boolean };

  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const SUITS: Array<{ sym: string; red: boolean }> = [
    { sym: "♠", red: false },
    { sym: "♥", red: true },
    { sym: "♦", red: true },
    { sym: "♣", red: false },
  ];

  let deck = $state<Card[]>([]); // remaining cards; the end of the array is the top
  let drawn = $state<Card[]>([]); // every card drawn since the last shuffle, in order
  let withJokers = $state(false);
  let spreadEl = $state<HTMLElement | null>(null);

  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function randomInt(maxExclusive: number): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }

  function shuffle() {
    const cards: Card[] = [];
    for (const s of SUITS)
      for (const r of RANKS) cards.push({ rank: r, suit: s.sym, red: s.red });
    if (withJokers) {
      cards.push({ rank: "★", suit: "JOKER", red: true, joker: true });
      cards.push({ rank: "★", suit: "JOKER", red: false, joker: true });
    }
    // Fisher–Yates with crypto RNG: the whole order exists before any card is revealed
    for (let i = cards.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    deck = cards;
    drawn = [];
  }

  shuffle();

  function draw() {
    if (!deck.length) return;
    const card = deck.pop()!; // result first: the card is decided before the flip plays
    deck = deck;
    drawn.push(card);
  }

  // keep the newest card in view as the spread grows
  $effect(() => {
    void drawn.length;
    if (spreadEl) spreadEl.scrollTop = spreadEl.scrollHeight;
  });

  const current = $derived(drawn.length ? drawn[drawn.length - 1] : null);

  function cardName(c: Card): string {
    if (c.joker) return c.red ? "red Joker" : "black Joker";
    const ranks: Record<string, string> = { A: "Ace", J: "Jack", Q: "Queen", K: "King" };
    const suits: Record<string, string> = { "♠": "Spades", "♥": "Hearts", "♦": "Diamonds", "♣": "Clubs" };
    return `${ranks[c.rank] ?? c.rank} of ${suits[c.suit]}`;
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
  <section class="card-deck" aria-label="Playing card deck">
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
          <div class="back"></div>
        {:else}
          <span class="empty-hint">empty</span>
        {/if}
      </button>

      <div class="spread" bind:this={spreadEl} aria-label="Drawn cards">
        {#if drawn.length}
          {#each drawn as c, i (i)}
            <div class="card" class:flip={!reduced} class:red={c.red} aria-label={cardName(c)}>
              {#if c.joker}
                <span class="corner">★</span>
                <span class="joker-label">JOKER</span>
              {:else}
                <span class="corner">{c.rank}<br />{c.suit}</span>
                <span class="pip">{c.suit}</span>
              {/if}
            </div>
          {/each}
        {:else}
          <span class="spread-hint">Tap the deck to draw — cards pile up here until you shuffle</span>
        {/if}
      </div>
    </div>

    <div class="status" aria-live="polite">
      {#if current}
        <span class="name" class:red-text={current.red}>{cardName(current)}</span>
      {:else}
        <span class="name muted">Nothing drawn yet</span>
      {/if}
      <span class="counts">{deck.length} left · {drawn.length} drawn</span>
    </div>

    <div class="actions">
      <button class="shuffle" onclick={shuffle}>Shuffle</button>
      <label class="jokers">
        <input type="checkbox" bind:checked={withJokers} />
        Jokers <span class="hint">(next shuffle)</span>
      </label>
    </div>
  </section>
{/if}

<style>
  .card-deck {
    position: absolute;
    bottom: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, calc(100vw - 24px));
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
    gap: 0.9rem;
    align-items: flex-start;
    width: 100%;
  }

  .pile {
    width: 92px;
    height: 128px;
    flex: none;
    border-radius: 9px;
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
    border-radius: 9px;
    background:
      repeating-linear-gradient(45deg, rgba(36, 29, 16, 0.25) 0 6px, transparent 6px 12px),
      #c9a35c;
    border: 2px solid #8f7434;
    box-shadow:
      2px 2px 0 rgba(143, 116, 52, 0.55),
      4px 4px 0 rgba(143, 116, 52, 0.3);
  }
  .pile:hover:not(:disabled) .back {
    filter: brightness(1.06);
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
  .pile:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 3px;
  }

  .spread {
    flex: 1;
    min-height: 128px;
    max-height: 236px;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    align-items: flex-start;
    gap: 0.35rem;
    padding: 0.5rem;
    border-radius: 10px;
    border: 1.5px dashed rgba(156, 147, 132, 0.4);
    perspective: 600px;
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 147, 132, 0.5) transparent;
  }
  .spread-hint {
    color: #9c9384;
    font-size: 0.82rem;
    align-self: center;
    text-align: center;
    width: 100%;
    padding: 2.2rem 0.5rem;
    box-sizing: border-box;
  }

  .card {
    position: relative;
    width: 54px;
    height: 76px;
    flex: none;
    border-radius: 6px;
    background: #fffdf6;
    border: 1px solid #b5a98e;
    font-family: Georgia, serif;
    color: #2a241a;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card.red {
    color: #a8352c;
  }

  .corner {
    position: absolute;
    top: 3px;
    left: 5px;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.05;
    text-align: center;
  }
  .pip {
    font-size: 1.7rem;
  }
  .joker-label {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    writing-mode: vertical-rl;
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
  .name.red-text {
    color: #e0897f;
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
  .jokers input:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }

  .jokers {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #e8e2d5;
    font-size: 0.85rem;
    cursor: pointer;
    user-select: none;
  }
  .jokers input {
    accent-color: #c9a35c;
  }
  .jokers .hint {
    color: #9c9384;
    font-size: 0.75rem;
  }
</style>
