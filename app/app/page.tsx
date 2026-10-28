"use client";

/** v2 screen 5: home. Story bank size, applications, the way to start one, and what comes next (SPEC 3.12). */
import { useEffect } from "react";
import { StateBlock } from "@/components/brand";
import { AppShell, Soon } from "@/components/v2/shell";
import { useWorkspace } from "@/components/v2/workspace";
import { answerText } from "@/lib/run/state";
import { SOON } from "@/lib/product";

const NEXT = ["ledger", "same-story", "rehearse", "memo", "style"];

export default function Home() {
  const { ready, ws, lines, seed, saveOk, update } = useWorkspace();
  // The demo account is seeded, so it lands here already set up (F02). Local starts at the picker.
  const skipStart = seed.persona;

  useEffect(() => {
    if (!ready || ws.onboarded) return;
    if (skipStart) update((w) => ({ ...w, onboarded: true }));
    else window.location.replace("/app/start");
  }, [ready, ws.onboarded, skipStart, update]);

  if (!ready || (!ws.onboarded && !skipStart)) return <AppShell here="home">{null}</AppShell>;

  const added = ws.entries.length;
  return (
    <AppShell here="home">
      <section className="stack loose" aria-labelledby="home-h">
        <div className="head-block">
          <h1 id="home-h" className="title">Your words, ready to use</h1>
          {seed.persona ? (
            <p className="meta">
              <span className="tag">Demo account</span> Seeded with Meera Iyer&apos;s sample stories (fictional).
            </p>
          ) : null}
        </div>
        {!saveOk ? (
          <StateBlock title="This browser blocks saving">
            <p>Your stories and answers work for this visit only. They are gone when you close the tab.</p>
          </StateBlock>
        ) : null}
        <div className="counts" aria-label="Your story bank">
          <span><b>{lines.length}</b>story lines</span>
          <span><b>{added}</b>{added === 1 ? "answer you added" : "answers you added"}</span>
          <span><b>{ws.apps.length}</b>{ws.apps.length === 1 ? "application" : "applications"}</span>
        </div>
        <div className="row">
          <a className="btn" href="/app/new">New application</a>
          <a className="textbtn" href="/app/stories">See your stories</a>
        </div>

        <div className="stack">
          <h2 className="sub">Applications</h2>
          {ws.apps.length ? (
            <ul className="list-rows">
              {ws.apps.map((a) => {
                const shown = a.run.answers.map(answerText).join(" ");
                return (
                  <li key={a.id}>
                    <a href={`/app/a/${encodeURIComponent(a.id)}`}>
                      {a.run.company}
                      <span>
                        {a.run.questions.length} questions · {shown.split(/\s+/).filter(Boolean).length} words · {a.created_at.slice(0, 10)}
                      </span>
                    </a>
                    {a.example ? <span className="tag">Example</span> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="meta">None yet. Start with a job link.</p>
          )}
        </div>

        <div className="stack">
          <h2 className="sub">What&apos;s next</h2>
          <ul className="list-rows">
            {SOON.filter((s) => NEXT.includes(s.slug)).map((s) => (
              <li key={s.slug}>
                <a href={`/app/soon/${s.slug}`}>
                  {s.name}
                  <span>{s.what}</span>
                </a>
                <Soon />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
