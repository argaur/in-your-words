import { readFileSync } from "node:fs";
import path from "node:path";
import { localMode } from "@/lib/api";
import { RunFlow } from "@/components/run-flow";
import { StateBlock, TopBar } from "@/components/brand";

export const dynamic = "force-dynamic";

function sample() {
  const dir = path.join(process.cwd(), "samples", "meera");
  return {
    raw: readFileSync(path.join(dir, "bank.md"), "utf8"),
    glossary: JSON.parse(readFileSync(path.join(dir, "glossary.json"), "utf8")) as Record<string, string>,
  };
}

export default function RunPage() {
  if (!localMode && process.env.LIVE_RUNS_ENABLED !== "1") {
    return (
      <>
        <TopBar />
        <main className="wrap stack">
          <StateBlock title="Live runs are not open yet" action={<a className="btn" href="/sample">See the saved run</a>}>
            <p>The saved run uses the same engine.</p>
          </StateBlock>
        </main>
      </>
    );
  }
  // The v1 research flow keeps its Direction D look, scoped by .v1 (app/legacy.css).
  return (
    <div className="v1">
      <RunFlow persona={sample()} local={localMode} />
    </div>
  );
}
