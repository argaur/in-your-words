"use client";

/**
 * Baseline mode (frame 10), local only. The H2 baseline: Gaurav pastes a plain AI draft of a
 * package and fixes it the way he normally would, under the same active-time timer.
 * The text is not kept. Only the time is saved, as a Run with mode "baseline".
 */
import { useState } from "react";
import { RunSchema } from "@/lib/engine/schema";
import { track } from "@/lib/analytics";
import { saveLocalRun } from "@/lib/run/client";
import { TimerBadge, useActiveTimer } from "./use-active-timer";

const ZERO = { tokens: 0, seconds: 0, cost_estimate: 0 };

export function BaselineView({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState("");
  const [company, setCompany] = useState("");
  const [phase, setPhase] = useState<"ready" | "timing" | "done">("ready");
  const [saved, setSaved] = useState<string | null>(null);
  const timer = useActiveTimer(phase === "timing");

  async function finish() {
    const seconds = timer.stop();
    setPhase("done");
    const run = RunSchema.parse({
      run_id: `${new Date().toISOString().slice(0, 10)}-baseline-${Math.random().toString(36).slice(2, 7)}`,
      mode: "baseline",
      persona: false,
      bank_source: "pasted",
      posting_url: "",
      company: company.trim(),
      steps: { research: "waiting", draft: "waiting", judge: "waiting" },
      fallback_model: false,
      usage: { research: ZERO, draft: ZERO, judge: ZERO },
      timer_active_seconds: seconds,
      story_lines: [],
      web_lines: [],
      questions: [],
      answers: [],
    });
    const r = await saveLocalRun(run);
    setSaved(r.error ? `not saved: ${r.error.code}` : r.data.path);
  }

  return (
    <section className="stack" aria-labelledby="base-h">
      <div>
        <button className="linkbtn" onClick={onBack}>Back to your stories</button>
        <h1 id="base-h" className="h1">Baseline: a plain AI draft</h1>
        <p className="helper">Paste a draft from any chat tool. Fix it as you normally would. Press Done when you would send it.</p>
      </div>
      <div className="field">
        <label htmlFor="base-co">Company</label>
        <input id="base-co" className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="base-draft">The draft</label>
        <textarea id="base-draft" className="textarea" style={{ minHeight: 360 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <small>The text stays in this tab. Only the time is saved.</small>
      </div>
      <div className="sticky-action">
        {phase === "ready" ? (
          <button
            className="btn action"
            disabled={!draft.trim()}
            onClick={() => {
              track("cta_clicked", { cta_name: "Start timer", surface: "baseline", destination: "baseline" });
              setPhase("timing");
            }}
          >
            Start timer
          </button>
        ) : phase === "timing" ? (
          <button className="btn action" onClick={finish}>Done</button>
        ) : null}
        {phase !== "ready" ? <TimerBadge seconds={phase === "done" ? timer.read() : timer.seconds} hidden={timer.hidden} /> : null}
        {saved ? <span className="saved">{saved}</span> : null}
      </div>
    </section>
  );
}
