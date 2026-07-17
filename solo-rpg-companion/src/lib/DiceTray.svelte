<script lang="ts">
  import { onDestroy } from "svelte";

  let { open = false, onclose }: { open?: boolean; onclose?: () => void } = $props();

  type Die = {
    id: number;
    max: number;
    value: number; // the real result (crypto RNG, generated before animation)
    display: number; // what the face currently shows (flickers during a roll)
    rolling: boolean;
    entering: boolean;
  };

  const PALETTE = [4, 6, 8, 10, 12, 20];
  const SHAPES: Record<number, { pts?: string; rect?: boolean; vy: number }> = {
    4: { pts: "37,8 68,62 6,62", vy: 46 },
    6: { rect: true, vy: 42 },
    8: { pts: "37,5 69,37 37,69 5,37", vy: 42 },
    10: { pts: "37,5 67,30 56,68 18,68 7,30", vy: 44 },
    // d12 pentagon is subtly different from d10 so the two read distinct
    12: { pts: "37,3 70,28 57,68 17,68 4,28", vy: 44 },
    20: { pts: "20,10 54,10 71,37 54,64 20,64 3,37", vy: 42 },
  };

  let dice = $state<Die[]>([]);
  let rolling = $state(false);
  let totalLabel = $state("–");
  let nextId = 0;

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  onDestroy(() => {
    for (const t of timers) clearTimeout(t);
    for (const i of intervals) clearInterval(i);
  });
  function after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  }

  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rollValue(max: number): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0] % max) + 1;
  }

  const formula = $derived.by(() => {
    const counts: Record<number, number> = {};
    for (const d of dice) counts[d.max] = (counts[d.max] || 0) + 1;
    return Object.keys(counts)
      .map(Number)
      .sort((a, b) => a - b)
      .map((m) => `${counts[m]}d${m}`)
      .join(" + ");
  });

  function showTotal() {
    totalLabel = dice.length
      ? String(dice.reduce((s, d) => s + d.value, 0))
      : "–";
  }

  function addDie(max: number) {
    if (rolling) return;
    const value = rollValue(max);
    dice.push({ id: nextId++, max, value, display: value, rolling: false, entering: true });
    showTotal();
  }

  function removeDie(id: number) {
    if (rolling) return;
    dice = dice.filter((d) => d.id !== id);
    showTotal();
  }

  function clear() {
    if (rolling) return;
    dice = [];
    showTotal();
  }

  function roll() {
    if (!dice.length || rolling) return;
    rolling = true;
    totalLabel = "…";

    // result first: every die's outcome exists before any theater plays
    for (const d of dice) d.value = rollValue(d.max);

    if (reduced) {
      for (const d of dice) d.display = d.value;
      settle();
      return;
    }

    // staggered tumble + number flicker that lands on the real result
    let pending = dice.length;
    dice.forEach((d, i) => {
      after(i * 90, () => {
        d.rolling = true;
        const flicker = setInterval(() => (d.display = rollValue(d.max)), 55);
        intervals.add(flicker);
        after(620, () => {
          clearInterval(flicker);
          intervals.delete(flicker);
          d.display = d.value;
          d.rolling = false;
          if (--pending === 0) settle();
        });
      });
    });
  }

  function settle() {
    const total = dice.reduce((s, d) => s + d.value, 0);
    if (reduced || dice.length === 1) {
      totalLabel = String(total);
    } else {
      const t0 = performance.now();
      const dur = 260;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        totalLabel = String(Math.round(total * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
        else totalLabel = String(total);
      };
      requestAnimationFrame(tick);
    }
    rolling = false;
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
  <section class="dice-tray" aria-label="Dice tray">
    <header>
      <span class="total" aria-live="polite">{totalLabel}</span>
      <span class="formula">{formula}</span>
    </header>

    <div class="tray" class:empty={dice.length === 0} aria-live="polite">
      {#each dice as d (d.id)}
        <button
          class="die"
          class:rolling={d.rolling}
          class:new={d.entering}
          onanimationend={() => (d.entering = false)}
          onclick={() => removeDie(d.id)}
          aria-label={`d${d.max} showing ${d.display}. Tap to remove.`}
        >
          <svg viewBox="0 0 74 74" aria-hidden="true">
            {#if SHAPES[d.max].rect}
              <rect class="shape" x="9" y="9" width="56" height="56" rx="12" />
            {:else}
              <polygon class="shape" points={SHAPES[d.max].pts} stroke-linejoin="round" />
            {/if}
            <text class="val" x="37" y={SHAPES[d.max].vy} text-anchor="middle">{d.display}</text>
            <text class="kind" x="37" y={SHAPES[d.max].vy + 16} text-anchor="middle">d{d.max}</text>
          </svg>
        </button>
      {/each}
    </div>

    <div class="palette" aria-label="Add a die">
      {#each PALETTE as max}
        <button onclick={() => addDie(max)} aria-label={`Add a d${max}`}>d{max}</button>
      {/each}
    </div>

    <div class="actions">
      <button class="roll" onclick={roll} disabled={dice.length === 0 || rolling}>Roll</button>
      <button class="clearbtn" onclick={clear} disabled={rolling}>Clear</button>
    </div>
  </section>
{/if}

<style>
  .dice-tray {
    position: absolute;
    bottom: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(440px, calc(100vw - 24px));
    background: rgba(28, 24, 21, 0.94);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(232, 226, 213, 0.12);
    border-radius: 16px;
    padding: 0.9rem 1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    z-index: 10;
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.7rem;
  }
  .total {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 2.6rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    min-width: 2ch;
    color: #e4c37e;
  }
  .formula {
    font-variant-numeric: tabular-nums;
    color: #9c9384;
    font-size: 0.9rem;
  }

  .tray {
    min-height: 96px;
    border-radius: 12px;
    border: 1.5px dashed rgba(156, 147, 132, 0.4);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.6rem;
  }
  .tray.empty::after {
    content: "Tap a die below to add it to the tray";
    color: #9c9384;
    font-size: 0.85rem;
  }

  .die {
    width: 68px;
    height: 68px;
    border: 0;
    padding: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .die svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .die .shape {
    fill: #f3ecdb;
    stroke: #8f8468;
    stroke-width: 2.5;
  }
  .die .val {
    font-family: Georgia, serif;
    font-size: 26px;
    font-weight: 700;
    fill: #2a241a;
    font-variant-numeric: tabular-nums;
  }
  .die .kind {
    font-size: 9.5px;
    fill: #7a715d;
    letter-spacing: 0.08em;
  }
  .die:hover .shape {
    stroke: #c9a35c;
  }
  .die:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 3px;
    border-radius: 10px;
  }

  @keyframes tumble {
    0% { transform: rotate(0deg) scale(1); }
    25% { transform: rotate(-14deg) scale(1.08); }
    55% { transform: rotate(11deg) scale(1.05); }
    80% { transform: rotate(-5deg) scale(1.02); }
    100% { transform: rotate(0deg) scale(1); }
  }
  .die.rolling {
    animation: tumble 0.62s cubic-bezier(0.34, 1.4, 0.44, 1);
  }
  @keyframes drop-in {
    from { transform: translateY(-14px) scale(0.6); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  .die.new {
    animation: drop-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .die.rolling, .die.new { animation: none; }
  }

  .palette {
    display: flex;
    gap: 0.4rem;
  }
  .palette button {
    flex: 1 1 0;
    padding: 0.5rem 0;
    border-radius: 9px;
    border: 1.5px solid rgba(156, 147, 132, 0.45);
    background: none;
    color: #e8e2d5;
    font: 600 0.88rem/1 inherit;
    font-family: inherit;
    cursor: pointer;
  }
  .palette button:hover {
    border-color: #c9a35c;
    color: #e4c37e;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .roll {
    flex: 1;
    border-radius: 9px;
    border: 0;
    cursor: pointer;
    background: #c9a35c;
    color: #241d10;
    font: 700 0.95rem/1 inherit;
    font-family: inherit;
    padding: 0.65rem 1rem;
    letter-spacing: 0.04em;
  }
  .roll:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .roll:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .clearbtn {
    border-radius: 9px;
    border: 1.5px solid rgba(156, 147, 132, 0.45);
    background: none;
    color: #9c9384;
    font: 600 0.9rem/1 inherit;
    font-family: inherit;
    padding: 0.65rem 1rem;
    cursor: pointer;
  }
  .clearbtn:hover:not(:disabled) {
    color: #e8e2d5;
  }

  .palette button:focus-visible,
  .roll:focus-visible,
  .clearbtn:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }
</style>
