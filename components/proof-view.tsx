"use client";

/**
 * The proof view (frames 8 and 9) and the defend sheet (frame 11), shared by Gaurav's local
 * run flow and the judges' saved run. The caller owns the Run; this owns only view state.
 */
import { useState, type ReactNode } from "react";
import type { Run } from "@/lib/engine/schema";
import { track } from "@/lib/analytics";
import { answerText, counts } from "@/lib/run/state";
import { StateBlock } from "./brand";
import { BlindRow, ClaimRow, CountsRow, DefendSheet, PasteView, type RowActions } from "./proof";

function cta(cta_name: string, surface: string, destination: string) {
  track("cta_clicked", { cta_name, surface, destination });
}

export function defendClaims(run: Run): number {
  return run.answers.flatMap((x) => x.sentences).filter((s) => s.status === "kept" && s.label !== "inference").length;
}

export function ProofView({
  run,
  actions,
  banner,
  onDefend,
  onNewRun,
  onAddStory,
  footer,
  readyAt,
  blind = false,
  onShowLabels,
  onCopied,
}: {
  run: Run;
  actions: RowActions;
  banner?: ReactNode;
  onDefend: () => void;
  onNewRun?: () => void;
  onAddStory?: () => void;
  footer?: ReactNode;
  readyAt: number;
  blind?: boolean; // local only: mark kept lines before seeing any proof (PRD self-grading rule)
  onShowLabels?: () => void;
  onCopied?: () => void;
}) {
  const [qIndex, setQIndex] = useState(0);
  const [view, setView] = useState<"check" | "paste">("check");
  const [copied, setCopied] = useState(false);
  const [showGapLines, setShowGapLines] = useState(false);

  const q = run.questions[qIndex];
  const a = run.answers[qIndex];
  const c = counts(a);
  const limit = q.word_limit;
  const questionTabs =
    run.questions.length > 1 ? (
      <div className="views" role="group" aria-label="Question">
        {run.questions.map((x, i) => (
          <button key={x.id} aria-pressed={i === qIndex} onClick={() => { setQIndex(i); setShowGapLines(false); setCopied(false); }}>
            {x.kind === "essay" ? x.id : "Note"}
          </button>
        ))}
      </div>
    ) : null;

  if (blind) {
    const keptAll = run.answers.flatMap((x) => x.sentences).filter((x) => x.status === "kept");
    const marked = keptAll.filter((x) => x.verdict !== "none").length;
    return (
      <section className="stack" aria-label="Mark without labels">
        {banner}
        <div>
          <h1 className="h1">Mark without labels</h1>
          <p className="helper">Mark each line true or false before you see its proof.</p>
        </div>
        {questionTabs}
        <h2 className="h2">{q.text}</h2>
        <div>{a.sentences.filter((x) => x.status === "kept").map((x) => <BlindRow key={x.id} s={x} actions={actions} />)}</div>
        <div className="sticky-action">
          <button className="btn action" onClick={() => { cta("Show labels", "blind", "proof"); onShowLabels?.(); }}>Show labels</button>
          <span className="helper" style={{ marginTop: 0 }}>{marked} of {keptAll.length} kept lines marked</span>
          {footer}
        </div>
      </section>
    );
  }

  return (
    <section className="stack" aria-label="Checked answers">
      {banner}
      <div className="line" style={{ justifyContent: "space-between" }}>
        <span className="kicker">{run.company}</span>
        {onNewRun ? <button className="linkbtn" onClick={onNewRun}>New run</button> : null}
      </div>
      {run.fallback_model ? (
        <div className="line">
          <span className="tag cut">Backup model</span>
          <span className="helper" style={{ marginTop: 0 }}>Drafted by the backup model. The check ran as normal.</span>
        </div>
      ) : null}
      {questionTabs}
      <h2 className="h2">{q.text}</h2>
      <CountsRow answer={a} />
      <div className="views" role="group" aria-label="View">
        {(["check", "paste"] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => { cta(v === "check" ? "Check" : "Paste", "proof", v); setView(v); }}>
            {v === "check" ? "Check" : "Paste"}
          </button>
        ))}
      </div>
      {a.unanswered ? (
        <StateBlock
          title="Not in your stories"
          action={onAddStory ? <button className="btn sec" onClick={() => { cta("Add a story", "proof", "bank"); onAddStory(); }}>Add a story</button> : undefined}
        >
          <p>
            {/* The judge's fallback topic is the question itself (rule 14), which reads badly after "about". */}
            {q.text.startsWith(a.unanswered.topic)
              ? "Most lines in this answer had no proof. Add a story that answers this question, then run again."
              : `Add a story about ${a.unanswered.topic}, then run again.`}
          </p>
        </StateBlock>
      ) : null}
      {a.unanswered && !showGapLines && a.sentences.length ? (
        <div><button className="linkbtn" onClick={() => setShowGapLines(true)}>Show the drafted lines</button></div>
      ) : null}
      {!a.unanswered || showGapLines ? (
        view === "check" ? (
          <div>{a.sentences.map((s) => <ClaimRow key={s.id} s={s} run={run} actions={actions} />)}</div>
        ) : (
          <PasteView answer={a} run={run} />
        )
      ) : null}
      <div className="sticky-action">
        <button
          className="btn action"
          disabled={c.kept + a.sentences.filter((s) => s.status === "restored").length === 0}
          onClick={async () => {
            await navigator.clipboard.writeText(answerText(a));
            setCopied(true);
            onCopied?.();
            track("package_copied", { answers: 1, active_minutes: Math.round((Date.now() - readyAt) / 60000) });
          }}
        >
          {copied ? "Copied" : "Copy answer"}
        </button>
        <button className="btn sec" onClick={() => { track("defend_sheet_opened", { claims: defendClaims(run) }); onDefend(); }}>
          Defend sheet
        </button>
        <span className="helper" style={{ marginTop: 0 }}>
          {a.word_count} words{limit ? `, limit ${limit}` : ""}
        </span>
        {footer}
      </div>
    </section>
  );
}

export function DefendView({ run, banner, onBack }: { run: Run; banner?: ReactNode; onBack: () => void }) {
  return (
    <section className="stack" aria-labelledby="def-h">
      <div className="no-print"><button className="linkbtn" onClick={onBack}>Back to the answers</button></div>
      {banner}
      <div>
        <h1 id="def-h" className="h1">Defend sheet</h1>
        <p className="helper">Every kept claim with the words you said. Read this before the interview.</p>
        <p className="helper">{run.company} · <span className="id" style={{ wordBreak: "break-all" }}>{run.posting_url}</span></p>
      </div>
      <DefendSheet run={run} />
      <div className="no-print"><button className="btn action" onClick={() => { cta("Print", "defend", "print"); window.print(); }}>Print</button></div>
    </section>
  );
}
