export type BookmarkColor = "red" | "blue" | "green";
export type Bookmark = { page: number; color: BookmarkColor; label?: string };

// All books' bookmarks live in one human-readable JSON file in the app data
// dir, keyed by the book's file path. In a plain browser (dev/test) the Tauri
// APIs are unavailable, so we fall back to localStorage.

const FILE = "bookmarks.json";

async function tauriFile(): Promise<{ fs: typeof import("@tauri-apps/plugin-fs"); path: string; dir: string }> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const dir = await appDataDir(); // throws outside Tauri
  return { fs, path: await join(dir, FILE), dir };
}

type Store = Record<string, Bookmark[]>;

async function readStore(): Promise<Store> {
  const { fs, path } = await tauriFile();
  if (!(await fs.exists(path))) return {};
  try {
    return JSON.parse(await fs.readTextFile(path));
  } catch {
    return {}; // unreadable/corrupt file: start fresh rather than crash
  }
}

function readLocalStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(FILE) ?? "{}");
  } catch {
    return {};
  }
}

export async function loadBookmarks(bookKey: string): Promise<Bookmark[]> {
  try {
    return (await readStore())[bookKey] ?? [];
  } catch {
    return readLocalStore()[bookKey] ?? [];
  }
}

export async function saveBookmarks(bookKey: string, list: Bookmark[]): Promise<void> {
  try {
    const store = await readStore();
    store[bookKey] = list;
    const { fs, path, dir } = await tauriFile();
    if (!(await fs.exists(dir))) await fs.mkdir(dir, { recursive: true });
    await fs.writeTextFile(path, JSON.stringify(store, null, 2));
  } catch {
    const store = readLocalStore();
    store[bookKey] = list;
    localStorage.setItem(FILE, JSON.stringify(store));
  }
}
