export type RefDoc = { name: string; path: string };

// Same pattern as bookmarks.ts: all books' reference docs live in one
// human-readable JSON file in the app data dir, keyed by the book's file path.
// localStorage fallback outside Tauri (browser dev).

const FILE = "refdocs.json";

async function tauriFile(): Promise<{ fs: typeof import("@tauri-apps/plugin-fs"); path: string; dir: string }> {
  const fs = await import("@tauri-apps/plugin-fs");
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const dir = await appDataDir(); // throws outside Tauri
  return { fs, path: await join(dir, FILE), dir };
}

type Store = Record<string, RefDoc[]>;

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

/** Display name for a reference doc: file name without directories or .pdf. */
export function refDocName(path: string): string {
  return path.split(/[\\/]/).pop()!.replace(/\.pdf$/i, "");
}

function dedupeByPath(docs: RefDoc[]): RefDoc[] {
  const seen = new Set<string>();
  return docs.filter((d) => !seen.has(d.path) && seen.add(d.path));
}

export async function loadRefDocs(bookKey: string): Promise<RefDoc[]> {
  try {
    return (await readStore())[bookKey] ?? [];
  } catch {
    return readLocalStore()[bookKey] ?? [];
  }
}

export async function saveRefDocs(bookKey: string, docs: RefDoc[]): Promise<void> {
  const list = dedupeByPath(docs);
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
