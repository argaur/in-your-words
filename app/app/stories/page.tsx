"use client";

/** v2 screen 6: the story bank. Every line a draft may use, each with its sticker, and a box to add one more by voice (SPEC 3.13). */
import { useMemo, useState } from "react";
import { AppShell, useNextId, VoiceBox } from "@/components/v2/shell";
import { useWorkspace } from "@/components/v2/workspace";

const FROM: Record<string, string> = { interview: "Interview", gap: "Answer to a question", memo: "Added here" };

function usedLabel(n: number) {
  return n ? <span className="used">In {n} {n === 1 ? "answer" : "answers"}</span> : <span className="small">Not used yet</span>;
}

export default function Stories() {
  const { ready, ws, lines, seed, addSpoken } = useWorkspace();
  const nextId = useNextId();
  const [text, setText] = useState("");
  const [shown, setShown] = useState(20);

  // How many kept answer lines cite each story line, across this browser's applications.
  const used = useMemo(() => {
    const n = new Map<string, number>();
    for (const a of ws.apps) for (const ans of a.run.answers) for (const s of ans.sentences) {
      if (s.status === "kept") for (const id of s.source_ids) n.set(id, (n.get(id) ?? 0) + 1);
    }
    return n;
  }, [ws.apps]);

  const idsFor = (entry: string) => {
    const flat = entry.replace(/\s+/g, " ");
    return lines.filter((l) => flat.includes(l.text.slice(0, 40))).map((l) => l.id);
  };

  return (
    <AppShell here="stories">
      <section className="stack loose" aria-labelledby="st-h">
        <div className="head-block">
          {/* Wait for the browser's added lines, or the seed count flashes first. */}
          <span className="kicker">{ready ? `${lines.length} story lines` : " "}</span>
          <h1 id="st-h" className="title">Your stories</h1>
          <p className="meta">Drafts can only use what is here. Every answer you give in the app is added.</p>
        </div>

        <div className="stack">
          <VoiceBox id="add" label="Add a story" value={text} onChange={setText} short nextId={nextId} hint="One story at a time: what happened, what you did, what changed." />
          <div>
            <button
              className="btn sec"
              disabled={!text.trim()}
              onClick={() => {
                addSpoken(text, "memo");
                setText("");
              }}
            >
              Add to my stories
            </button>
          </div>
        </div>

        {ws.entries.length ? (
          <div className="stack">
            <h2 className="sub">What you added</h2>
            <ol className="bank">
              {[...ws.entries].reverse().map((e) => {
                const ids = idsFor(e.text);
                return (
                  <li key={e.id}>
                    <span className="stk">{ids[0] ?? e.id}</span>
                    <span>
                      {e.text}
                      <span className="small">
                        {FROM[e.source]} · {e.at.slice(0, 10)} · {usedLabel(ids.reduce((m, id) => m + (used.get(id) ?? 0), 0))}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        <div className="stack">
          <h2 className="sub">{seed.persona ? "Sample stories (Meera Iyer, fictional)" : "Your story bank"}</h2>
          <ol className="bank" aria-label="Story lines">
            {lines.slice(0, shown).map((l) => (
              <li key={l.id}>
                <span className="stk">{l.id}</span>
                <span>
                  {l.text}
                  {usedLabel(used.get(l.id) ?? 0)}
                </span>
              </li>
            ))}
          </ol>
          {shown < lines.length ? (
            <div>
              <button className="textbtn" onClick={() => setShown(shown + 40)}>
                Show more ({lines.length - shown} left)
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
