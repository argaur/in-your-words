"use client";

/** v2 screen 3: pick what you want to do. Job applications are live; the rest say so plainly (SPEC 3.11). */
import { useState } from "react";
import { AppShell, Soon } from "@/components/v2/shell";
import { useWorkspace } from "@/components/v2/workspace";
import { track } from "@/lib/analytics";
import { USE_CASES } from "@/lib/product";

export default function Start() {
  const { ws, update } = useWorkspace();
  const [picked, setPicked] = useState<string[]>(ws.use_cases.length ? ws.use_cases : ["jobs"]);

  return (
    <AppShell>
      <section className="stack" aria-labelledby="start-h">
        <div className="head-block">
          <span className="kicker">Step 1 of 2</span>
          <div className="pips" aria-hidden="true"><span className="on" /><span /></div>
          <h1 id="start-h" className="title">What do you want to write in your own words?</h1>
          <p className="meta">Pick one or more. Your stories are shared across all of them.</p>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr">Use cases</legend>
          {USE_CASES.map((u) => {
            const on = picked.includes(u.slug);
            return (
              <label className="check" key={u.slug}>
                <input
                  type="checkbox"
                  checked={u.live && on}
                  disabled={!u.live}
                  onChange={() => setPicked(on ? picked.filter((p) => p !== u.slug) : [...picked, u.slug])}
                />
                <span>
                  <b>
                    {u.name}
                    {u.live ? null : <Soon />}
                  </b>
                  <span>{u.line}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="bottom-bar">
          <button
            className="btn"
            disabled={!picked.length}
            onClick={() => {
              update((w) => ({ ...w, use_cases: picked }));
              track("cta_clicked", { cta_name: "Next: a short interview", surface: "start", destination: "interview" });
              window.location.href = "/app/interview";
            }}
          >
            Next: a short interview
          </button>
          <span className="small">5 questions, about 5 minutes, by voice.</span>
        </div>
      </section>
    </AppShell>
  );
}
