<script lang="ts">
  import { onDestroy } from "svelte";
  import { loadAudioState, saveAudioState, type AudioTrack as Track } from "./audioStore";

  let {
    open = false,
    onclose,
    crossfade = 2.5, // seconds; overridable for tests
    pickFiles = defaultPickFiles,
    readTrack = defaultReadTrack,
  }: {
    open?: boolean;
    onclose?: () => void;
    crossfade?: number;
    pickFiles?: () => Promise<Track[] | null>;
    readTrack?: (path: string) => Promise<ArrayBuffer>;
  } = $props();

  const EXTS = /\.(mp3|ogg|wav|flac|m4a|aac|opus)$/i;
  const AUDIO_EXTENSIONS = ["mp3", "ogg", "wav", "flac", "m4a", "aac", "opus"];

  async function defaultPickFiles(): Promise<Track[] | null> {
    const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
    const picked = await openDialog({
      title: "Add audio tracks",
      multiple: true,
      filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
    });
    if (!picked) return null;
    const paths = Array.isArray(picked) ? picked : [picked];
    return paths.map((p) => ({
      name: p.split(/[\\/]/).pop()!.replace(EXTS, ""),
      path: p,
    }));
  }

  async function defaultReadTrack(path: string): Promise<ArrayBuffer> {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  // --- engine ---------------------------------------------------------------

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let nowPlaying: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    startedAt: number;
    buffer: AudioBuffer;
  } | null = null;
  const buffers = new Map<string, AudioBuffer>();
  let advancing = false;

  let tracks = $state<Track[]>([]);
  let index = $state(0);
  let playing = $state(false);
  let started = $state(false); // a source exists (maybe suspended)
  let volume = $state(0.8);
  let loadError = $state("");
  let timeLabel = $state("");

  function fmt(s: number): string {
    const whole = Math.max(0, Math.floor(s));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  function ensureCtx(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  async function bufferFor(path: string): Promise<AudioBuffer> {
    const cached = buffers.get(path);
    if (cached) return cached;
    const buf = await ensureCtx().decodeAudioData(await readTrack(path));
    buffers.set(path, buf);
    if (buffers.size > 4) {
      // keep memory bounded: drop the oldest entry that isn't playing next
      const first = buffers.keys().next().value;
      if (first && first !== path) buffers.delete(first);
    }
    return buf;
  }

  async function startTrack(i: number, fade: number = crossfade) {
    if (!tracks.length) return;
    const c = ensureCtx();
    if (c.state === "suspended") await c.resume();
    const buf = await bufferFor(tracks[i].path);

    const gain = c.createGain();
    gain.connect(master!);
    const source = c.createBufferSource();
    source.buffer = buf;
    source.connect(gain);

    const t = c.currentTime;
    const old = nowPlaying;
    if (old && fade > 0) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.source.stop(t + fade);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(1, t + fade);
    } else {
      old?.source.stop(t);
      gain.gain.setValueAtTime(1, t);
    }

    source.start(t);
    nowPlaying = { source, gain, startedAt: t, buffer: buf };
    index = i;
    playing = true;
    started = true;
    advancing = false;
    persist();

    // decode the next track ahead of time so the crossfade never stutters
    void bufferFor(tracks[(i + 1) % tracks.length].path).catch(() => {});
  }

  // watch the current track: update the elapsed clock, crossfade into the next
  // track near the end, and stop after the last one (no playlist loop).
  // ctx.currentTime freezes while suspended, so pause naturally pauses this too
  const watcher = setInterval(() => {
    if (!ctx || !nowPlaying || !playing || advancing) return;
    const dur = nowPlaying.buffer.duration;
    const elapsed = Math.min(ctx.currentTime - nowPlaying.startedAt, dur);
    timeLabel = `${fmt(elapsed)} / ${fmt(dur)}`;
    const remaining = dur - elapsed;
    const last = index >= tracks.length - 1;
    if (!last && remaining <= crossfade + 0.05) {
      advancing = true;
      void startTrack(index + 1);
    } else if (last && remaining <= 0.05) {
      // playlist finished: rest the needle at the top, ready to play again
      nowPlaying = null;
      playing = false;
      started = false;
      index = 0;
      timeLabel = "";
      persist();
    }
  }, 200);

  async function togglePlay() {
    if (!started) {
      await startTrack(index, 0);
      return;
    }
    const c = ensureCtx();
    if (playing) {
      await c.suspend();
      playing = false;
    } else {
      await c.resume();
      playing = true;
    }
  }

  function skip() {
    if (tracks.length) void startTrack((index + 1) % tracks.length, Math.min(0.6, crossfade));
  }

  function selectTrack(i: number) {
    void startTrack(i, started ? Math.min(0.6, crossfade) : 0);
  }

  async function addTracks() {
    try {
      const picked = await pickFiles();
      if (!picked?.length) return;
      loadError = "";
      const known = new Set(tracks.map((t) => t.path));
      const fresh = picked.filter((t) => !known.has(t.path));
      if (!tracks.length) index = 0;
      tracks.push(...fresh);
      persist();
    } catch {
      loadError = "Couldn't add those files";
    }
  }

  function clearPlaylist() {
    nowPlaying?.source.stop();
    nowPlaying = null;
    tracks = [];
    index = 0;
    playing = false;
    started = false;
    timeLabel = "";
    buffers.clear();
    persist();
  }

  function persist() {
    void saveAudioState({ tracks: $state.snapshot(tracks), track: index, volume });
  }

  $effect(() => {
    if (master) master.gain.value = volume;
  });

  // restore last session's playlist (paused) on startup
  loadAudioState().then((s) => {
    if (!s?.tracks?.length || tracks.length) return;
    tracks = s.tracks;
    index = Math.min(s.track ?? 0, s.tracks.length - 1);
    volume = s.volume ?? 0.8;
  });

  onDestroy(() => {
    clearInterval(watcher);
    nowPlaying?.source.stop();
    void ctx?.close();
  });

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      e.preventDefault();
      onclose?.();
    }
  }
</script>

<svelte:window {onkeydown} />

{#if tracks.length}
  <div class="mini" class:playing>
    <button class="mini-btn" onclick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
      {playing ? "⏸" : "▶"}
    </button>
    <span class="mini-name" title={tracks[index].name}>{tracks[index].name}</span>
    {#if timeLabel}<span class="mini-time">{timeLabel}</span>{/if}
    <button class="mini-btn" onclick={skip} aria-label="Next track">⏭</button>
  </div>
{/if}

{#if open}
  <section class="audio-drawer" aria-label="Audio player">
    <button class="dismiss" onclick={() => onclose?.()} title="Close" aria-label="Close the audio drawer">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
    <div class="head">
      <button class="folder" onclick={addTracks}>
        {tracks.length ? "Add tracks" : "Add audio tracks"}
      </button>
      {#if tracks.length}
        <span class="folder-name">{tracks.length} track{tracks.length === 1 ? "" : "s"}</span>
        <button class="clear" onclick={clearPlaylist}>Clear</button>
      {/if}
    </div>
    {#if loadError}<div class="error">{loadError}</div>{/if}

    {#if tracks.length}
      <ul class="list">
        {#each tracks as t, i (t.path)}
          <li>
            <button class="track" class:current={i === index} onclick={() => selectTrack(i)}>
              <span class="track-mark">{i === index ? (playing ? "♪" : "‖") : ""}</span>
              <span class="track-name">{t.name}</span>
            </button>
          </li>
        {/each}
      </ul>
      <label class="volume">
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          bind:value={volume}
          onchange={persist}
        />
      </label>
    {:else if !loadError}
      <p class="hint">Pick some audio files — they become the playlist. Tracks loop with a gentle crossfade.</p>
    {/if}
  </section>
{/if}

<style>
  .mini {
    position: absolute;
    bottom: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3rem 0.45rem;
    border-radius: 12px;
    background: rgba(28, 24, 21, 0.82);
    backdrop-filter: blur(6px);
    opacity: 0.35;
    transition: opacity 0.15s;
    z-index: 6;
    max-width: 260px;
  }
  .mini:hover,
  .mini.playing {
    opacity: 0.8;
  }
  .mini:hover {
    opacity: 1;
  }
  .mini-btn {
    border: 0;
    background: none;
    color: #e8e2d5;
    font-size: 0.85rem;
    padding: 0.3rem 0.4rem;
    border-radius: 7px;
    cursor: pointer;
  }
  .mini-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .mini-btn:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 1px;
  }
  .mini-name {
    color: #cfc7b6;
    font-size: 0.8rem;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini-time {
    color: #9c9384;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    padding: 0 0.15rem;
  }

  .audio-drawer {
    position: absolute;
    bottom: 64px;
    left: 50%;
    transform: translateX(-50%);
    width: min(400px, calc(100vw - 24px));
    background: rgba(28, 24, 21, 0.94);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(232, 226, 213, 0.12);
    border-radius: 16px;
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    z-index: 10;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .folder {
    border-radius: 9px;
    border: 0;
    cursor: pointer;
    background: #c9a35c;
    color: #241d10;
    font: 700 0.85rem/1 inherit;
    font-family: inherit;
    padding: 0.55rem 1rem;
  }
  .folder:hover {
    filter: brightness(1.08);
  }
  .folder:focus-visible {
    outline: 2px solid #e8e2d5;
    outline-offset: 2px;
  }
  .folder-name {
    color: #9c9384;
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .clear {
    border-radius: 8px;
    border: 1.5px solid rgba(156, 147, 132, 0.45);
    background: none;
    color: #9c9384;
    font: 600 0.8rem/1 inherit;
    font-family: inherit;
    padding: 0.45rem 0.8rem;
    cursor: pointer;
  }
  .clear:hover {
    color: #e8e2d5;
  }
  .clear:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: 2px;
  }

  .error {
    color: #e0897f;
    font-size: 0.85rem;
  }
  .hint {
    color: #9c9384;
    font-size: 0.85rem;
    margin: 0;
    line-height: 1.45;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 147, 132, 0.5) transparent;
  }
  .track {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    border: 0;
    background: none;
    color: #cfc7b6;
    font: 0.88rem/1.3 inherit;
    font-family: inherit;
    text-align: left;
    padding: 0.4rem 0.5rem;
    border-radius: 7px;
    cursor: pointer;
  }
  .track:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .track.current {
    color: #e4c37e;
    background: rgba(201, 163, 92, 0.14);
  }
  .track:focus-visible {
    outline: 2px solid #c9a35c;
    outline-offset: -2px;
  }
  .track-mark {
    width: 1em;
    flex: none;
    text-align: center;
  }
  .track-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .volume {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: #9c9384;
    font-size: 0.8rem;
  }
  .volume input {
    flex: 1;
    accent-color: #c9a35c;
  }
  .dismiss {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: none;
    color: #9c9384;
    cursor: pointer;
  }
  .dismiss svg { width: 14px; height: 14px; }
  .dismiss:hover { background: rgba(255, 255, 255, 0.08); color: #e8e2d5; }
  .dismiss:focus-visible { outline: 2px solid #c9a35c; outline-offset: 2px; }
</style>
