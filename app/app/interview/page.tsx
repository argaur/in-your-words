"use client";

/**
 * v2 screen 4: the short voice interview that starts a story bank. One question at a time.
 * Each answer is saved as soon as the user moves on, so leaving halfway loses nothing (SPEC 3.15).
 */
import { useState } from "react";
import { AppShell, useNextId, VoiceBox } from "@/components/v2/shell";
import { useWorkspace } from "@/components/v2/workspace";
import { track } from "@/lib/analytics";
import { INTERVIEW } from "@/lib/product";

function cta(cta_name: string) {
  track("cta_clicked", { cta_name, surface: "interview", destination: "interview" });
}

export default function Interview() {
  const { ws, update, addSpoken, seed } = useWorkspace();
  const nextId = useNextId();
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [given, setGiven] = useState(0);
  const item = INTERVIEW[i];
  const last = i === INTERVIEW.length - 1;

  function finish(skipped: boolean, count: number) {
    update((w) => ({ ...w, onboarded: true }));
    track("onboarding_completed", { use_cases: ws.use_cases.join(","), answers: count, skipped });
    window.location.href = "/app";
  }

  function advance(save: boolean) {
    const text = save ? answer.trim() : "";
    const count = given + (text ? 1 : 0);
    if (text) addSpoken(text, "interview", item.q);
    setGiven(count);
    setAnswer("");
    if (last) finish(false, count);
    else setI(i + 1);
  }

  return (
    <AppShell>
      <section className="stack" aria-labelledby="int-h">
        <div className="head-block">
          <span className="kicker">
            Step 2 of 2 · Question {i + 1} of {INTERVIEW.length}
          </span>
          <div className="pips" aria-hidden="true">
            {INTERVIEW.map((_, k) => (
              <span key={k} className={k <= i ? "on" : undefined} />
            ))}
          </div>
          <h1 id="int-h" className="q">{item.q}</h1>
          <p className="meta">{item.hint}</p>
        </div>
        <VoiceBox
          id="answer"
          label="Your answer"
          value={answer}
          onChange={setAnswer}
          nextId={nextId}
          hint="Talk like you would to a friend. Short parts are fine. Say only what is true."
        />
        <div className="bottom-bar">
          <button className="btn" disabled={!answer.trim()} onClick={() => { cta(last ? "Save and finish" : "Next question"); advance(true); }}>
            {last ? "Save and finish" : "Next question"}
          </button>
          <button className="textbtn" onClick={() => { cta("Skip this one"); advance(false); }}>
            Skip this one
          </button>
          <button className="textbtn" onClick={() => { cta("Skip for now"); finish(true, given); }}>
            {seed.persona ? "Skip for now, use the sample stories" : "Skip for now"}
          </button>
        </div>
        <p className="small">Every answer goes into your story bank. Drafts can only use what is in it.</p>
      </section>
    </AppShell>
  );
}
