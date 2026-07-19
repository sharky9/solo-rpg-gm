<script lang="ts">
  import { onDestroy } from "svelte";

  let { open = false, onclose }: { open?: boolean; onclose?: () => void } = $props();

  type Face = "H" | "T";

  let face = $state<Face | null>(null); // the real result (crypto RNG, generated before animation)
  let display = $state<Face>("H"); // what the coin currently shows
  let flipping = $state(false);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  onDestroy(() => {
    for (const t of timers) clearTimeout(t);
    for (const i of intervals) clearInterval(i);
  });

  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function flipValue(): Face {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % 2 === 0 ? "H" : "T";
  }

  function flip() {
    if (flipping) return;
    // result first: the outcome exists before any theater plays
    face = flipValue();

    if (reduced) {
      display = face;
      return;
    }

    flipping = true;
    const flicker = setInterval(() => {
      display = display === "H" ? "T" : "H";
    }, 80);
    intervals.add(flicker);
    const t = setTimeout(() => {
      timers.delete(t);
      clearInterval(flicker);
      intervals.delete(flicker);
      display = face!;
      flipping = false;
    }, 900);
    timers.add(t);
  }

  const label = $derived(
    flipping ? "…" : face === null ? "Tap to flip" : face === "H" ? "Heads" : "Tails"
  );

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      e.preventDefault();
      onclose?.();
    }
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <section class="coin-flip" aria-label="Coin flip">
    <button class="dismiss" onclick={() => onclose?.()} title="Close" aria-label="Close the coin flip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
    <button
      class="coin"
      class:flipping
      onclick={flip}
      aria-label={flipping ? "Flipping…" : `Coin showing ${label}. Tap to flip.`}
    >
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle class="rim" cx="48" cy="48" r="45" />
        <circle class="inner" cx="48" cy="48" r="36" />
        <text class="val" x="48" y="60" text-anchor="middle">{face === null && !flipping ? "?" : display}</text>
      </svg>
    </button>
    <div class="label" aria-live="polite">{label}</div>
    <button class="flip" onclick={flip} disabled={flipping}>Flip</button>
  </section>
{/if}

<style>
  .coin-flip {
    position: absolute;
    bottom: 64px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(28, 24, 21, 0.94);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(232, 226, 213, 0.12);
    border-radius: 16px;
    padding: 1.1rem 1.4rem 1.1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    z-index: 10;
  }

  .coin {
    width: 108px;
    height: 108px;
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .coin svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .rim {
    fill: #c9a35c;
    stroke: #8f7434;
    stroke-width: 2;
  }
  .inner {
    fill: #f3ecdb;
    stroke: #b5a069;
    stroke-width: 1.5;
  }
  .val {
    font-family: Georgia, serif;
    font-size: 40px;
    font-weight: 700;
    fill: #2a241a;
  }
  .coin:hover .rim {
    filter: brightness(1.08);
  }
  .coin:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 3px;
    border-radius: 50%;
  }

  @keyframes coin-spin {
    0% { transform: rotateY(0deg) translateY(0); }
    30% { transform: rotateY(540deg) translateY(-16px); }
    70% { transform: rotateY(1260deg) translateY(-6px); }
    100% { transform: rotateY(1800deg) translateY(0); }
  }
  .coin.flipping svg {
    animation: coin-spin 0.9s cubic-bezier(0.3, 0.6, 0.4, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .coin.flipping svg { animation: none; }
  }

  .label {
    font-family: Georgia, serif;
    font-size: 1.15rem;
    color: #e4c37e;
    min-height: 1.4em;
  }

  .flip {
    border-radius: 9px;
    border: 0;
    cursor: pointer;
    background: #c9a35c;
    color: #241d10;
    font: 700 0.95rem/1 inherit;
    font-family: inherit;
    padding: 0.6rem 2.2rem;
    letter-spacing: 0.04em;
  }
  .flip:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .flip:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .flip:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }
  /* overlaps the panel corner like a badge — same border/backdrop as the
     panel so it reads as a chip sitting on top of it */
  .dismiss {
    position: absolute;
    top: -11px;
    right: -11px;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(232, 226, 213, 0.18);
    border-radius: 50%;
    background: #2c2723;
    color: #9c9384;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
    transition: background 0.15s, color 0.15s;
  }
  .dismiss svg { width: 14px; height: 14px; }
  .dismiss:hover { background: #3a332c; color: #e8e2d5; }
  .dismiss:focus-visible { outline: 2px solid #c9a35c; outline-offset: 2px; }
</style>
