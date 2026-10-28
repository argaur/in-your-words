"use client";

/**
 * Proof surfaces (C3): claim rows for the Check view, the Paste view, the counts row and the
 * defend sheet. They read a parsed Run and never call the server.
 */
import { useState } from "react";
import type { Answer, Run, Sentence } from "@/lib/engine/schema";
import { counts, shownQuote } from "@/lib/run/state";

export type RowActions = {
  onMark: (id: string, verdict: "true" | "false", blind?: boolean) => void;
  onRestore: (id: string) => void;
  onCutAgain: (id: string) => void;
};

/** Blind mode (frame 10): the claim and the mark pair only. No tag, ID, strike or reason. */
export function BlindRow({ s, actions }: { s: Sentence; actions: RowActions }) {
  return (
    <div className="row" data-blind="true">
      <p className="claim">{s.text}</p>
      <div className="verdict">
        <span className="marks">
          <span>You marked:</span>
          <span className="mark" role="group" aria-label="Is this line true?">
            <button aria-pressed={s.verdict === "true"} onClick={() => actions.onMark(s.id, "true", true)}>True</button>
            <button aria-pressed={s.verdict === "false"} onClick={() => actions.onMark(s.id, "false", true)}>False</button>
          </span>
        </span>
      </div>
    </div>
  );
}

function wordsTag(run: Run): string {
  return run.persona ? "Her words" : "Your words";
}

function webHost(run: Run, ids: string[]): string | null {
  const w = run.web_lines.find((l) => ids.includes(l.id));
  if (!w) return null;
  try {
    return new URL(w.url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Ids({ ids }: { ids: string[] }) {
  return <span className="id">{ids.join(" ")}</span>;
}

export function ClaimRow({
  s,
  run,
  actions,
  defaultOpen = false,
  marks = true, // false: a read-only example row, no marks, Restore or Cut again
}: {
  s: Sentence;
  run: Run;
  actions: RowActions;
  defaultOpen?: boolean;
  marks?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const quote = shownQuote(s, run);
  const canOpen = (s.label === "spoken" || s.label === "web") && s.status === "kept" && quote;
  const numbers = s.number_check.numbers;

  return (
    <div className={`row${s.status === "cut" ? " cut" : ""}`} data-status={s.status}>
      <p className="claim">{s.text}</p>
      <div className="verdict">
        {s.status === "cut" ? (
          <>
            <span className="tag cut">Cut</span>
            <span>{s.cut_reason}</span>
            {marks ? <button className="btn sec" onClick={() => actions.onRestore(s.id)}>Restore</button> : null}
          </>
        ) : s.status === "restored" ? (
          <>
            <span className="tag restored">Restored, not backed</span>
            <span>You restored this line. Nothing in your stories supports it.</span>
            {marks ? <button className="btn sec" onClick={() => actions.onCutAgain(s.id)}>Cut again</button> : null}
          </>
        ) : s.label === "inference" ? (
          <>
            <span className="tag inf">Inference</span>
            <span>{s.generic ? "Generic. No fact in this line." : "Links your facts. Adds no new one."}</span>
          </>
        ) : canOpen ? (
          <button className="tagbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className={`tag ${s.label === "spoken" ? "backed" : "web"}`}>{s.label === "spoken" ? wordsTag(run) : "Web"}</span>
            <Ids ids={s.source_ids} />
            <span>
              {s.label === "web" ? webHost(run, s.source_ids) ?? "web source" : numbers.length ? `number ${numbers.join(", ")} found` : open ? "hide the words" : "show the words"}
            </span>
          </button>
        ) : (
          <>
            <span className={`tag ${s.label === "spoken" ? "backed" : "web"}`}>{s.label === "spoken" ? wordsTag(run) : "Web"}</span>
            <Ids ids={s.source_ids} />
          </>
        )}
        {marks ? (
          <span className="marks">
            <span>You marked:</span>
            <span className="mark" role="group" aria-label="Is this line true?">
              <button aria-pressed={s.verdict === "true"} onClick={() => actions.onMark(s.id, "true")}>True</button>
              <button aria-pressed={s.verdict === "false"} onClick={() => actions.onMark(s.id, "false")}>False</button>
            </span>
          </span>
        ) : null}
      </div>
      {open && quote ? <p className="quote">&ldquo;{quote}&rdquo;</p> : null}
    </div>
  );
}

export function CountsRow({ answer }: { answer: Answer }) {
  const c = counts(answer);
  return (
    <div className="counts" aria-label="Counts for this answer">
      <div><b>{c.kept}</b>kept</div>
      <div><b>{c.cut}</b>cut</div>
      <div><b>{c.fromWords}</b>facts from your words</div>
      <div><b>{c.notBacked}</b>not backed</div>
      <div><b>{c.generic}</b>{c.generic === 1 ? "generic line" : "generic lines"}</div>
    </div>
  );
}

/** The answer as it goes into the form, with small marks, and the rail of words beside or below. */
export function PasteView({ answer, run }: { answer: Answer; run: Run }) {
  const [on, setOn] = useState<string | null>(null);
  const shown = answer.sentences.filter((s) => s.status !== "cut");
  const select = (id: string) => {
    setOn(id);
    document.getElementById(`n-${id}`)?.scrollIntoView({ block: "nearest" });
  };
  return (
    <div className="paste">
      <p className="para">
        {shown.map((s) => (
          <span key={s.id}>
            {/* A span, not a button: Chrome lays a button out as a box, which breaks the paragraph. */}
            <span
              role="button"
              tabIndex={0}
              className={`s${on === s.id ? " on" : ""}`}
              onClick={() => select(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(s.id);
                }
              }}
            >
              {s.text}
            </span>
            <sup>{s.status === "restored" ? "R" : s.label === "inference" ? "i" : s.source_ids.join(" ")}</sup>{" "}
          </span>
        ))}
      </p>
      <div className="rail">
        {shown.map((s) => (
          <div key={s.id} id={`n-${s.id}`} className={`n${on === s.id ? " on" : ""}`}>
            <span className="id">{s.status === "restored" ? "Restored, not backed" : s.label === "inference" ? "Inference" : s.source_ids.join(" ")}</span>
            {s.status === "kept" && s.label !== "inference" ? <>&ldquo;{shownQuote(s, run)}&rdquo;</> : s.generic ? "Generic. No fact in this line." : "No source."}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kept spoken and web claims with the words behind them, plus any restored line, flagged. */
export function DefendSheet({ run }: { run: Run }) {
  const items = run.answers.flatMap((a) =>
    a.sentences.filter((s) => (s.status === "kept" && s.label !== "inference") || s.status === "restored").map((s) => ({ s, q: a.question_id })),
  );
  if (items.length === 0) return <p className="helper">No kept claims yet. Run a package first.</p>;
  return (
    <ul className="defend">
      {items.map(({ s }) => (
        <li key={s.id}>
          <b>{s.text}</b>
          {s.status === "restored" ? (
            <span className="tag restored">Restored, not backed</span>
          ) : (
            <span>
              &ldquo;{shownQuote(s, run)}&rdquo; ({s.source_ids.join(", ")})
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
