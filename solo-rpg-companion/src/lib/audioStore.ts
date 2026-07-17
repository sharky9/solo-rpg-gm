export type AudioTrack = { name: string; path: string };
export type AudioState = { tracks: AudioTrack[]; track: number; volume: number };

// Same pattern as bookmarks.ts: human-readable JSON in the app data dir,
// localStorage fallback outside Tauri (browser dev).

const FILE = "audio.json";

async function tauriFile(): Promise<{ fs: typeof import("@tauri-apps/plugin-fs"); path: string; dir: string }> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const dir = await appDataDir(); // throws outside Tauri
  return { fs, path: await join(dir, FILE), dir };
}

export async function loadAudioState(): Promise<AudioState | null> {
  try {
    const { fs, path } = await tauriFile();
    if (!(await fs.exists(path))) return null;
    return JSON.parse(await fs.readTextFile(path));
  } catch {
    try {
      const raw = localStorage.getItem(FILE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function saveAudioState(state: AudioState): Promise<void> {
  const json = JSON.stringify(state, null, 2);
  try {
    const { fs, path, dir } = await tauriFile();
    if (!(await fs.exists(dir))) await fs.mkdir(dir, { recursive: true });
    await fs.writeTextFile(path, json);
  } catch {
    localStorage.setItem(FILE, json);
  }
}
