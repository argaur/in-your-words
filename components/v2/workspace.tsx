"use client";

/**
 * v2 workspace context: the seed story bank from the server plus what this browser added.
 * Every screen under /app reads and writes through here, so storage stays in one place.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Run, StoryLine } from "@/lib/engine/schema";
import { addEntry, buildLines, loadWorkspace, saveWorkspace, type AppRecord, type EntrySource, type Workspace } from "@/lib/workspace";

export type Seed = { raw: string; glossary: Record<string, string>; persona: boolean; example: Run | null };

type Ctx = {
  ready: boolean;
  local: boolean;
  /** False once the browser refused a save: stories and answers last for this visit only. */
  saveOk: boolean;
  seed: Seed;
  ws: Workspace;
  lines: StoryLine[];
  update: (change: (ws: Workspace) => Workspace) => void;
  addSpoken: (text: string, source: EntrySource, prompt?: string) => void;
  saveApp: (app: AppRecord) => void;
};

const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ seed, local, children }: { seed: Seed; local: boolean; children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(() => ({ version: 1, use_cases: [], onboarded: false, entries: [], apps: [] }));
  const [ready, setReady] = useState(false);
  const [saveOk, setSaveOk] = useState(true);

  // Storage is read after mount: the server render has no localStorage.
  useEffect(() => {
    setWs(loadWorkspace(local, seed.example ?? undefined));
    setReady(true);
  }, [local, seed.example]);

  const update = useCallback(
    (change: (w: Workspace) => Workspace) => {
      setWs((prev) => {
        const next = change(prev);
        setSaveOk(saveWorkspace(local, next));
        return next;
      });
    },
    [local],
  );

  const addSpoken = useCallback(
    (text: string, source: EntrySource, prompt?: string) => {
      if (!text.trim()) return;
      update((w) => addEntry(w, { text, source, prompt }));
      // Locally, Gaurav's own words also go into stories/bank.md, so the CLI and /run see them.
      if (local) {
        void fetch("/api/bank/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, source, prompt }) }).catch(() => null);
      }
    },
    [update, local],
  );

  const saveApp = useCallback((app: AppRecord) => update((w) => ({ ...w, apps: [app, ...w.apps.filter((a) => a.id !== app.id)] })), [update]);

  // Locally, answers are also appended to stories/bank.md, so after a reload the seed already
  // holds them. Skip those entries here or every line would count twice.
  const lines = useMemo(() => {
    const flat = seed.raw.replace(/\s+/g, " ");
    const fresh = ws.entries.filter((e) => !flat.includes(e.text.replace(/\s+/g, " ").trim()));
    return buildLines(seed.raw, seed.glossary, fresh);
  }, [seed.raw, seed.glossary, ws.entries]);

  return <WorkspaceCtx.Provider value={{ ready, local, saveOk, seed, ws, lines, update, addSpoken, saveApp }}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace(): Ctx {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error("useWorkspace outside WorkspaceProvider");
  return c;
}
