/**
 * v2 workspace (PRODUCT_V2.md sections 4 and 8): what one user has said and made, kept in the
 * browser. The seed story bank (the Meera persona on production, stories/bank.md locally) stays
 * on the server; the browser keeps only what the user added: voice answers and applications.
 * Nothing a visitor types is stored on the server.
 */
import { applyGlossary, splitBank, splitSentences } from "./engine/bank";
import { RunSchema, type Run, type StoryLine } from "./engine/schema";

export type EntrySource = "interview" | "gap" | "memo";
export type Entry = { id: string; text: string; source: EntrySource; prompt?: string; at: string };
export type AppRecord = { id: string; created_at: string; run: Run; run_token?: string; example?: boolean };

export type Workspace = {
  version: 1;
  use_cases: string[];
  onboarded: boolean;
  entries: Entry[];
  apps: AppRecord[];
};

export function emptyWorkspace(): Workspace {
  return { version: 1, use_cases: [], onboarded: false, entries: [], apps: [] };
}

export function addEntry(ws: Workspace, e: { text: string; source: EntrySource; prompt?: string }): Workspace {
  const n = ws.entries.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0) + 1;
  const entry: Entry = { id: `E${n}`, text: e.text.trim(), source: e.source, at: new Date().toISOString(), ...(e.prompt ? { prompt: e.prompt } : {}) };
  return { ...ws, entries: [...ws.entries, entry] };
}

/** The evidence for a new run: seed lines first, then every voice entry, numbered S1, S2, ... */
export function buildLines(seedRaw: string, glossary: Record<string, string>, entries: Entry[]): StoryLine[] {
  const base = seedRaw.trim() ? splitBank(seedRaw, glossary) : [];
  return appendLines(base, entries.map((e) => e.text).join("\n"), glossary, base);
}

/** New story lines from spoken text, numbered after the highest S id already there. */
export function appendLines(existing: StoryLine[], text: string, glossary: Record<string, string>, keep: StoryLine[] = []): StoryLine[] {
  let n = existing.reduce((m, l) => Math.max(m, Number(l.id.slice(1)) || 0), 0);
  const added = text
    .split(/\r?\n/)
    .flatMap((part) => splitSentences(applyGlossary(part, glossary)))
    .map((t) => ({ id: `S${++n}`, text: t }));
  return [...keep, ...added];
}

const KEY = (local: boolean) => `iyw:v2:${local ? "local" : "demo"}`;

/** Read the saved workspace. Storage can be missing or blocked: then start fresh, never crash. */
export function loadWorkspace(local: boolean, example?: Run): Workspace {
  const fresh = (): Workspace => {
    const ws = emptyWorkspace();
    return example ? { ...ws, apps: [{ id: example.run_id, created_at: new Date().toISOString(), run: example, example: true }] } : ws;
  };
  try {
    const raw = localStorage.getItem(KEY(local));
    if (!raw) return fresh();
    const ws = JSON.parse(raw) as Workspace;
    if (ws.version !== 1 || !Array.isArray(ws.entries) || !Array.isArray(ws.apps)) return fresh();
    // A saved run that no longer matches the schema is dropped rather than breaking the page.
    return { ...ws, apps: ws.apps.filter((a) => RunSchema.safeParse(a.run).success) };
  } catch {
    return fresh();
  }
}

export function saveWorkspace(local: boolean, ws: Workspace): boolean {
  try {
    // Keep the newest 12 applications: each run is about 50 KB and storage is about 5 MB.
    localStorage.setItem(KEY(local), JSON.stringify({ ...ws, apps: ws.apps.slice(0, 12) }));
    return true;
  } catch {
    return false;
  }
}
