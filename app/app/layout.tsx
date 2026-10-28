import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { localMode } from "@/lib/api";
import { RunSchema } from "@/lib/engine/schema";
import { WorkspaceProvider, type Seed } from "@/components/v2/workspace";
import saved from "@/samples/meera/run.json";

export const dynamic = "force-dynamic";

/**
 * The seeded account. Production: the fictional Meera bank plus her saved application as an
 * example. Local: Gaurav's stories/bank.md, read on his machine only, and no example.
 */
function seed(): Seed {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
  const ownBank = path.join(process.cwd(), "stories", "bank.md");
  if (localMode && existsSync(ownBank)) {
    const g = path.join(process.cwd(), "stories", "glossary.json");
    return { raw: read("stories/bank.md"), glossary: existsSync(g) ? JSON.parse(read("stories/glossary.json")) : {}, persona: false, example: null };
  }
  return { raw: read("samples/meera/bank.md"), glossary: JSON.parse(read("samples/meera/glossary.json")), persona: true, example: RunSchema.parse(saved) };
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider seed={seed()} local={localMode}>
      {children}
    </WorkspaceProvider>
  );
}
