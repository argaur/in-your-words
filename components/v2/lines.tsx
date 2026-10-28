"use client";

/**
 * One line of the answer sheet, in each of its states (SPEC section 4, "Line states in the sheet"),
 * and the desktop list "Where each line came from". The sticker is the source ID: tap it and the
 * cited words open under the line, verbatim.
 */
import { forwardRef, useRef, useState } from "react";
import type { Run, Sentence } from "@/lib/engine/schema";
import { askFor } from "@/lib/engine/voice";
import { ErrorLine } from "../brand";
import { VoiceBox } from "./shell";

export type LineState = "backed" | "web" | "link" | "flagged" | "web-flagged" | "rewriting" | "edited" | "rechecking" | "kept-anyway";

/** The full cited line for one source ID. Showing whole lines keeps every number of the claim in view (C14). */
export function quoteFor(id: string, run: Run): string {
  return [...run.story_lines, ...run.web_lines].find((l) => l.id === id)?.text ?? "";
}

export function lineState(s: Sentence, busy?: "gap" | "recheck"): LineState {
  if (busy === "gap") return "rewriting";
  if (busy === "recheck") return "rechecking";
  if (s.edited) return "edited";
  if (s.status === "cut") return s.label === "web" ? "web-flagged" : "flagged";
  if (s.status === "restored") return "kept-anyway";
  if (s.label === "inference" || !s.source_ids.length) return "link";
  return s.label === "web" ? "web" : "backed";
}

/** A line that still needs her words: counted in the copy bar and reached by "Go to line". */
export function needsWords(s: Sentence): boolean {
  return s.status === "cut" && s.label !== "web";
}

export function askOf(s: Sentence): string | undefined {
  return s.ask ?? askFor(s, s.number_check);
}

function Sticker({ id, printed, big = false }: { id: string; printed?: boolean; big?: boolean }) {
  return <span className={`stk${id.startsWith("W") ? " web" : ""}${printed ? " print" : ""}${big ? " big" : ""}`}>{id}</span>;
}

function Exhibits({ s, run, drop }: { s: Sentence; run: Run; drop: boolean }) {
  return (
    <div className={`exh inline-only${drop ? " drop" : ""}`}>
      {s.source_ids.map((id) => (
        <div className="exh-row" key={id}>
          <Sticker id={id} big />
          <blockquote>{id.startsWith("W") ? quoteFor(id, run) : <>&ldquo;{quoteFor(id, run)}&rdquo;</>}</blockquote>
        </div>
      ))}
    </div>
  );
}

export type LineProps = {
  s: Sentence;
  run: Run;
  live: boolean;
  /** F01 example: answer the flagged line only. No edits, no rechecks. */
  gapOnly?: boolean;
  open: boolean;
  justOpened: boolean;
  settled: boolean;
  printed: Set<string>;
  busy?: "gap" | "recheck";
  error?: string;
  phone: boolean;
  nextId: string;
  who: string;
  onToggle: () => void;
  onGap: (text: string) => void;
  onRecheck: () => void;
  onEdit: (text: string) => void;
  onKeep: () => void;
  onLeave: () => void;
  onCta: (name: string) => void;
};

export const Line = forwardRef<HTMLDivElement, LineProps>(function Line(p, ref) {
  const { s, run, live } = p;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.text);
  const [spoken, setSpoken] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [emptyPress, setEmptyPress] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const state = lineState(s, p.busy);
  const editBtn = live && !p.gapOnly ? (
    <button className="textbtn" onClick={() => { setDraft(s.text); setEditing(true); }}>
      Edit line
    </button>
  ) : null;
  const errId = `err-${s.id}`;
  const err = p.error ? (
    <div className="ln-err">
      <ErrorLine id={errId}>{p.error}</ErrorLine>
    </div>
  ) : null;

  if (editing) {
    return (
      <div className="ln edit" ref={ref} data-line={s.id}>
        <div className="field">
          <label htmlFor={`edit-${s.id}`}>Edit this line</label>
          <textarea id={`edit-${s.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sec" disabled={!draft.trim()} onClick={() => { p.onEdit(draft); setEditing(false); }}>
            Save
          </button>
          <button className="textbtn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (state === "backed" || state === "web") {
    const web = state === "web";
    return (
      <div className="ln" data-open={p.open} data-line={s.id} ref={ref}>
        <p className={`tx${p.settled ? " settle" : ""}`}>
          {s.text}
          <button
            className="stk-btn"
            aria-expanded={p.open}
            aria-label={`${web ? "From the web" : p.who}: ${s.source_ids.join(", ")}. ${p.open ? "Hide" : "Show"} the words`}
            onClick={p.onToggle}
          >
            {s.source_ids.map((id) => (
              <Sticker key={id} id={id} printed={p.printed.has(id)} />
            ))}
          </button>
        </p>
        {p.open ? (
          <>
            <Exhibits s={s} run={run} drop={p.justOpened} />
            <div className="exh-meta inline-only">
              {web ? "From the job posting" : `${p.who}, said aloud`}
              {editBtn}
            </div>
          </>
        ) : null}
        {err}
      </div>
    );
  }

  if (state === "link") {
    return (
      <div className="ln" data-line={s.id} ref={ref}>
        <p className="tx">
          {s.text}
          <span className="note">{s.generic ? "Generic. No fact in this line." : "Joins your facts. Adds no new one."}</span>
        </p>
        {editBtn ? <div className="exh-meta">{editBtn}</div> : null}
        {err}
      </div>
    );
  }

  if (state === "rewriting" || state === "rechecking") {
    return (
      <div className="ln busy" data-line={s.id} aria-busy="true" ref={ref}>
        <p className="tx">
          {s.text}
          {state === "rewriting" ? (
            <span className="stks">
              <span className="stk empty">{p.nextId}</span>
            </span>
          ) : null}
        </p>
        <p className="busy-label" role="status">
          <span className="spin" aria-hidden="true" />
          {state === "rewriting" ? "Rewriting..." : "Checking..."}
        </p>
      </div>
    );
  }

  if (state === "edited") {
    return (
      <div className="ln" data-line={s.id} ref={ref}>
        <p className="tx">
          {s.text}
          <span className="stks">
            <span className="stk outline">Edited, not checked</span>
          </span>
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          {live ? (
            <button className="btn sec" onClick={p.onRecheck} aria-describedby={p.error ? errId : undefined}>
              Recheck
            </button>
          ) : null}
          {editBtn}
        </div>
        {err}
      </div>
    );
  }

  if (state === "kept-anyway") {
    return (
      <div className="ln" data-line={s.id} ref={ref}>
        <p className="tx">
          {s.text}
          <span className="stks">
            <span className="stk outline">Kept, not backed</span>
          </span>
        </p>
        <p className="reason" style={{ marginTop: 6 }}>You kept this line. Nothing you said backs it yet.</p>
        <div className="row">
          <button className="textbtn" onClick={() => { p.onCta("Leave it out"); p.onLeave(); }}>
            Leave it out
          </button>
          {editBtn}
        </div>
        {err}
      </div>
    );
  }

  // Flagged: a line with no backing. Web lines are about the employer, so she is never asked.
  const ask = state === "flagged" ? askOf(s) : undefined;
  const boxOpen = !p.phone || voiceOpen;
  const hintId = `gap-${s.id}-empty`;
  return (
    <div className="ln flag" data-line={s.id} ref={ref}>
      <p className="tx">
        {s.text}
        <span className="stks">
          <span className="stk empty">{state === "web-flagged" ? "No source" : "Needs your words"}</span>
        </span>
      </p>
      <div className="gap">
        {/* A fallback question already opens with the reason (askFor): show it once. */}
        {s.cut_reason && !ask?.startsWith(s.cut_reason.trim().replace(/[.\s]+$/, "")) ? <p className="reason">{s.cut_reason}</p> : null}
        {ask ? (
          live && p.phone && !voiceOpen ? (
            <button
              className="ask"
              data-ask={s.id}
              onClick={() => {
                // Focus inside the tap, or iOS will not open the keyboard (SPEC section 7).
                box.current?.focus();
                setVoiceOpen(true);
              }}
            >
              <span className="asked">Asked back</span>
              {ask}
              <span className="go">Answer by voice</span>
            </button>
          ) : (
            <p className="ask">
              <span className="asked">Asked back</span>
              {ask}
            </p>
          )
        ) : null}
        {live && ask ? (
          <>
            <VoiceBox
              ref={box}
              id={`gap-${s.id}`}
              label="Speak your answer"
              value={spoken}
              onChange={(v) => { setSpoken(v); if (v.trim()) setEmptyPress(false); }}
              hint="Speak it. Your answer is added to your stories and this line is rewritten from it."
              nextId={p.nextId}
              describedBy={[emptyPress ? hintId : "", p.error ? errId : ""].filter(Boolean).join(" ") || undefined}
              shut={!boxOpen}
            />
            {emptyPress ? (
              <p className="err" id={hintId}>
                Speak your answer first.
              </p>
            ) : null}
          </>
        ) : null}
        {live ? (
          <div className="row">
            {ask && boxOpen ? (
              <button
                className="btn"
                onClick={() => {
                  if (!spoken.trim()) {
                    setEmptyPress(true);
                    box.current?.focus();
                    return;
                  }
                  p.onGap(spoken);
                }}
              >
                Use my answer
              </button>
            ) : null}
            <button className="textbtn" onClick={() => { p.onCta("Keep it anyway"); p.onKeep(); }}>
              Keep it anyway
            </button>
            {editBtn}
          </div>
        ) : null}
      </div>
      {err}
    </div>
  );
});

/** Desktop right column: every source of the current answer, in line order. */
export function SourceList({
  sentences,
  run,
  open,
  nextId,
  busy,
  printed,
  onToggle,
}: {
  sentences: Sentence[];
  run: Run;
  open: Record<string, boolean>;
  nextId: string;
  busy: Record<string, "gap" | "recheck" | undefined>;
  printed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const items: React.ReactNode[] = [];
  for (const s of sentences) {
    const st = lineState(s, busy[s.id]);
    if (st === "flagged" || st === "rewriting") {
      items.push(
        <li key={`${s.id}-gap`}>
          <span className="stk empty">{st === "rewriting" ? nextId : " ? "}</span>
          <span>
            {st === "rewriting" ? "Printing from your answer..." : `Nothing yet. ${askOf(s) ?? ""}`}
            <span className="k">Needs your words</span>
          </span>
        </li>,
      );
    }
    if (st === "backed" || st === "web") {
      for (const id of s.source_ids) {
        const web = id.startsWith("W");
        items.push(
          <li key={`${s.id}-${id}`} data-on={Boolean(open[s.id])}>
            <button className="stk-btn" aria-label={`${web ? "Web source" : "Said aloud"} ${id}: ${open[s.id] ? "hide" : "show"} in the answer`} onClick={() => onToggle(s.id)}>
              <Sticker id={id} printed={printed.has(id)} />
            </button>
            <span>
              {web ? quoteFor(id, run) : <>&ldquo;{quoteFor(id, run)}&rdquo;</>}
              <span className="k">{web ? "Job posting" : "Said aloud"}</span>
            </span>
          </li>,
        );
      }
    }
  }
  return (
    <div className="list">
      <h3>Where each line came from</h3>
      <ol>{items}</ol>
    </div>
  );
}
