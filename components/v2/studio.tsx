"use client";

/**
 * v2 screen 9: the answer studio (SPEC 3.1 to 3.7). One sheet that reads as the answer, each line
 * ending in the stickers of what backs it. A line with no backing is flagged with one question; the
 * user answers by voice and the line is rewritten from that answer and checked again. Any line can
 * be edited, then rechecked. /sample renders the same view read-only on the saved run.
 */
import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import { track } from "@/lib/analytics";
import type { Run, Sentence, StoryLine } from "@/lib/engine/schema";
import * as api from "@/lib/run/client";
import { answerText, runReducer, type RunAction } from "@/lib/run/state";
import { appendLines, type AppRecord } from "@/lib/workspace";
import { StateBlock, TopBar } from "../brand";
import { askOf, Line, needsWords, quoteFor, SourceList } from "./lines";
import { AppShell, useNextId, VoiceBox } from "./shell";
import { useWorkspace } from "./workspace";

type Busy = Record<string, "gap" | "recheck" | undefined>;

function wordsOf(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function nextIdOf(lines: StoryLine[]): string {
  return `S${lines.reduce((m, l) => Math.max(m, Number(l.id.slice(1)) || 0), 0) + 1}`;
}

export function defendClaims(run: Run): number {
  return run.answers.flatMap((x) => x.sentences).filter((s) => s.status === "kept" && s.label !== "inference").length;
}

function cta(cta_name: string, destination = "studio") {
  track("cta_clicked", { cta_name, surface: "studio", destination });
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    setPhone(m.matches);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

type Fixer = (s: Sentence, mode: "gap" | "recheck", spoken?: string) => Promise<{ error?: string; sentence?: Sentence; added?: StoryLine[] }>;

/** The app studio: a saved application in this browser. */
export function Studio({ app }: { app: AppRecord }) {
  const { seed, local, addSpoken, saveApp } = useWorkspace();
  const [run, dispatch] = useReducer(runReducer, app.run);
  const r = run as Run;
  const live = local || Boolean(app.run_token);
  // F01: on the demo, the example application can answer its flagged line twice a day, with no live run.
  const gapOnly = !live && Boolean(app.example) && seed.persona;
  const nextId = useNextId();

  // Every change is saved with the application, in this browser.
  useEffect(() => {
    if (run && run !== app.run) saveApp({ ...app, run });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const fix: Fixer = async (s, mode, spoken = "") => {
    const a = r.answers.find((x) => x.sentences.some((y) => y.id === s.id));
    const q = r.questions.find((x) => x.id === a?.question_id) ?? r.questions[0];
    let story = r.story_lines;
    let added: StoryLine[] = [];
    const ask = askOf(s);
    if (mode === "gap") {
      addSpoken(spoken, "gap", ask);
      added = appendLines(r.story_lines, spoken, seed.glossary);
      dispatch({ type: "addLines", lines: added });
      story = [...r.story_lines, ...added];
    }
    const res = await api.fixLine({
      ...(gapOnly ? { example: true } : { run_token: app.run_token }),
      mode,
      company: r.company,
      question: q,
      sentence: { id: s.id, text: s.text, ...(ask ? { ask } : {}) },
      ...(mode === "gap" ? { answer: spoken } : {}),
      others: (a?.sentences ?? []).filter((x) => x.id !== s.id && x.status !== "cut").map((x) => x.text),
      story_lines: story,
      web_lines: r.web_lines,
    });
    if (res.error) {
      track("error_shown", { error_type: res.error.code, surface: "studio", message: res.error.code });
      return {
        error:
          res.error.code === "bad_token" || res.error.code === "token_used" || res.error.code === "example_used"
            ? "This session has ended. Start a new application to keep fixing lines."
            : "That did not go through. Try again.",
      };
    }
    dispatch({ type: "replace", sentence: res.data.sentence });
    track(mode === "gap" ? "gap_answered" : "line_rechecked", { status: res.data.sentence.status });
    return { sentence: res.data.sentence, added };
  };

  return (
    <AppShell wide>
      <StudioView
        run={r}
        dispatch={dispatch}
        live={live}
        gapOnly={gapOnly}
        example={Boolean(app.example)}
        nextId={nextId}
        fix={fix}
        onSaveUnanswered={(text, topic) => addSpoken(text, "gap", topic)}
      />
    </AppShell>
  );
}

/** /sample: the saved sample run, read-only, one look with the app (SPEC 3.14). */
export function SampleStudio({ run }: { run: Run }) {
  const [state, dispatch] = useReducer(runReducer, run);
  useEffect(() => {
    track("replay_viewed", { run_id: run.run_id });
  }, [run.run_id]);
  return (
    <>
      <TopBar
        right={
          <a className="icon-btn shell-btn" href="/login" onClick={() => track("cta_clicked", { cta_name: "Try the demo", surface: "replay", destination: "login" })}>
            Try the demo
          </a>
        }
      />
      <main className="wrap wide">
        <StudioView run={state as Run} dispatch={dispatch} live={false} example sample nextId={nextIdOf(run.story_lines)} />
      </main>
    </>
  );
}

function StudioView({
  run: r,
  dispatch,
  live,
  gapOnly = false,
  example,
  sample = false,
  nextId,
  fix,
  onSaveUnanswered,
}: {
  run: Run;
  dispatch: Dispatch<RunAction>;
  live: boolean;
  gapOnly?: boolean;
  example: boolean;
  sample?: boolean;
  nextId: string;
  fix?: Fixer;
  onSaveUnanswered?: (text: string, topic: string) => void;
}) {
  const [qIndex, setQIndex] = useState(0);
  const [view, setView] = useState<"answer" | "defend">("answer");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<Busy>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // One-shot motion flags: each plays on the render that set it, never again (C28).
  const [justOpened, setJustOpened] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);
  const [printed, setPrinted] = useState<Set<string>>(new Set());
  const phone = usePhone();
  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const q = r.questions[qIndex];
  const a = r.answers[qIndex];
  const clean = answerText(a);
  const need = a.sentences.filter(needsWords);
  const who = r.persona ? "Her words" : "Your words";
  const hard = Boolean(a.unanswered) && !clean;

  // Desktop starts with the first backed line open; a phone reads the answer first.
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      const first = a.sentences.find((s) => s.status === "kept" && s.source_ids.length);
      if (first) setOpen((o) => ({ ...o, [first.id]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex]);

  useEffect(() => {
    setCopied(false);
  }, [r]);

  useEffect(() => {
    if (!justOpened && !settled && !printed.size) return;
    const t = setTimeout(() => {
      setJustOpened(null);
      setSettled(null);
      setPrinted(new Set());
    }, 600);
    return () => clearTimeout(t);
  }, [justOpened, settled, printed]);

  function toggle(id: string) {
    const next = !open[id];
    setOpen((o) => ({ ...o, [id]: next }));
    setJustOpened(next ? id : null);
  }

  async function runFix(s: Sentence, mode: "gap" | "recheck", spoken = "") {
    if (!fix) return;
    setBusy((b) => ({ ...b, [s.id]: mode }));
    setErrors((e) => ({ ...e, [s.id]: "" }));
    const res = await fix(s, mode, spoken);
    setBusy((b) => ({ ...b, [s.id]: undefined }));
    if (res.error) return setErrors((e) => ({ ...e, [s.id]: res.error ?? "" }));
    if (mode === "gap" && res.sentence?.status === "kept") {
      const fresh = new Set((res.added ?? []).map((l) => l.id));
      setPrinted(new Set(res.sentence.source_ids.filter((id) => fresh.has(id))));
      setOpen((o) => ({ ...o, [s.id]: true }));
      setJustOpened(s.id);
      setSettled(s.id);
    }
  }

  function goToLine() {
    cta("Go to line");
    const first = need[0];
    const el = first ? lineRefs.current[first.id] : null;
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    const target = el.querySelector<HTMLElement>("[data-ask]") ?? el.querySelector<HTMLElement>("textarea");
    target?.focus({ preventScroll: true });
  }

  if (view === "defend") return <DefendView run={r} who={who} onBack={() => setView("answer")} />;

  const tabs =
    r.questions.length > 1 ? (
      <div className="seg" role="group" aria-label="Question">
        {r.questions.map((x, i) => (
          <button key={x.id} aria-pressed={i === qIndex} onClick={() => { setQIndex(i); setCopied(false); setPrinted(new Set()); }}>
            {x.kind === "essay" ? x.id : "Note"}
          </button>
        ))}
      </div>
    ) : null;

  const savedNote =
    example && !live ? (
      <div className="saved-note" role="note">
        <span>
          {sample
            ? "This is a saved example. Answering a flagged line needs the demo."
            : gapOnly
              ? "This is a saved example. You can answer its flagged line here, two tries a day. Start a new application to try the rest."
              : "This is a saved example. Answering questions and rechecking need a live run. Start a new application to try them."}
        </span>
        <a className="btn sec" href={sample ? "/login" : "/app/new"}>
          {sample ? "Try the demo" : "New application"}
        </a>
      </div>
    ) : null;

  return (
    <section className="studio" aria-label="Your answers">
      <div className="head">
        <div>
          <span className="kicker">{sample ? "Saved sample run · Meera Iyer, fictional" : example ? "Example application" : "Application"}</span>
          <h1 className="title">{r.company}</h1>
        </div>
        <button
          className="btn sec"
          onClick={() => {
            track("defend_sheet_opened", { claims: defendClaims(r) });
            setView("defend");
          }}
        >
          Defend sheet
        </button>
      </div>
      {r.persona && !sample ? <p className="small">Sample stories from Meera Iyer (fictional).</p> : null}
      <div className="work">
        <section className="answer" aria-label="Answer">
          {tabs}
          {savedNote}
          <h2 className="q">{q.text}</h2>
          <div className="sheet">
            {a.unanswered ? (
              <Unanswered key={q.id} topic={a.unanswered.topic} live={live} nextId={nextId} onSave={onSaveUnanswered} />
            ) : null}
            {a.sentences.map((s) => (
              <Line
                key={s.id}
                ref={(el) => {
                  lineRefs.current[s.id] = el;
                }}
                s={s}
                run={r}
                live={live || gapOnly}
                gapOnly={gapOnly}
                open={Boolean(open[s.id])}
                justOpened={justOpened === s.id}
                settled={settled === s.id}
                printed={printed}
                busy={busy[s.id]}
                error={errors[s.id]}
                phone={phone}
                nextId={nextId}
                who={who}
                onToggle={() => toggle(s.id)}
                onGap={(text) => void runFix(s, "gap", text)}
                onRecheck={() => void runFix(s, "recheck")}
                onEdit={(text) => {
                  track("line_edited", { label: s.label });
                  dispatch({ type: "edit", id: s.id, text });
                }}
                onKeep={() => dispatch({ type: "restore", id: s.id })}
                onLeave={() => dispatch({ type: "cutAgain", id: s.id })}
                onCta={(name) => cta(name)}
              />
            ))}
          </div>
          <div className={`copybar${sample ? " no-tabs" : ""}`}>
            <button
              className="btn"
              disabled={!clean}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(clean);
                } catch {
                  // Clipboard blocked: the button still says what it tried.
                }
                setCopied(true);
                track("package_copied", { answers: 1, active_minutes: 0 });
              }}
            >
              {copied ? "Copied" : "Copy answer"}
            </button>
            <span className="count" aria-live="polite">
              {hard ? (
                <>
                  <b>0</b> words{q.word_limit ? ` of ${q.word_limit}` : ""} · this question needs your words
                </>
              ) : (
                <>
                  <b>{wordsOf(clean)}</b> words{q.word_limit ? ` of ${q.word_limit}` : ""} ·{" "}
                  {need.length ? `${need.length} ${need.length === 1 ? "line needs" : "lines need"} your words` : "every line backed or yours"}
                </>
              )}
            </span>
            {need.length && (live || gapOnly) && clean ? (
              <span className="copy-warn">
                <span>{need.length === 1 ? "1 line still needs your words." : `${need.length} lines still need your words.`}</span>
                <button className="textbtn" onClick={goToLine}>
                  Go to line
                </button>
              </span>
            ) : null}
          </div>
        </section>
        <aside className="side" aria-label="Where each line came from">
          <SourceList sentences={a.sentences} run={r} open={open} nextId={nextId} busy={busy} printed={printed} onToggle={toggle} />
        </aside>
      </div>
    </section>
  );
}

/** Hard state (SPEC 3.6): the engine found nothing in her stories for this question and drafted nothing. */
function Unanswered({ topic, live, nextId, onSave }: { topic: string; live: boolean; nextId: string; onSave?: (text: string, topic: string) => void }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"ask" | "saved" | "skipped">("ask");
  const [emptyPress, setEmptyPress] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="ln flag">
      <p className="tx">
        Nothing drafted for this question.
        <span className="stks">
          <span className="stk empty">Needs your words</span>
        </span>
      </p>
      <div className="gap">
        <p className="reason">None of your stories cover {topic}, so nothing was written and nothing was guessed.</p>
        {state === "saved" ? (
          <p className="meta" role="status">Saved to your stories. It is used in your next application.</p>
        ) : state === "skipped" ? null : (
          <>
            <p className="ask">
              <span className="asked">Asked back</span>
              Tell us about {topic}, in your own words.
            </p>
            {live ? (
              <>
                <VoiceBox
                  ref={box}
                  id="unanswered"
                  label="Speak your answer"
                  value={text}
                  onChange={(v) => { setText(v); if (v.trim()) setEmptyPress(false); }}
                  hint="Speak it. Your answer is added to your stories."
                  nextId={nextId}
                  describedBy={emptyPress ? "unanswered-empty" : undefined}
                />
                {emptyPress ? <p className="err" id="unanswered-empty">Speak your answer first.</p> : null}
                <div className="row">
                  <button
                    className="btn"
                    onClick={() => {
                      if (!text.trim()) {
                        setEmptyPress(true);
                        box.current?.focus();
                        return;
                      }
                      onSave?.(text, topic);
                      setState("saved");
                    }}
                  >
                    Use my answer
                  </button>
                  <button className="textbtn" onClick={() => { cta("Skip this question"); setState("skipped"); }}>
                    Skip this question
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Screen 10: every kept claim with the words that back it. Read before the interview. */
function DefendView({ run, who, onBack }: { run: Run; who: string; onBack: () => void }) {
  const claims = run.answers.flatMap((a) => a.sentences).filter((s) => s.status === "kept" && s.label !== "inference" && s.source_ids.length);
  return (
    <section className="stack" aria-labelledby="def-h">
      <div className="no-print">
        <button className="textbtn" onClick={onBack}>
          Back to the answers
        </button>
      </div>
      <div className="head-block">
        <h1 id="def-h" className="title">Defend sheet</h1>
        <p className="meta">Every kept claim with the words you said. Read this before the interview.</p>
        <p className="small" style={{ overflowWrap: "anywhere" }}>
          {run.company} · {run.posting_url}
        </p>
      </div>
      {claims.length ? (
        <ol className="defend-list sheet">
          {claims.map((s) => (
            <li key={s.id}>
              <p className="tx">{s.text}</p>
              <div className="exh">
                {s.source_ids.map((id) => (
                  <div className="exh-row" key={id}>
                    <span className={`stk big${id.startsWith("W") ? " web" : ""}`}>{id}</span>
                    <blockquote>{id.startsWith("W") ? quoteFor(id, run) : <>&ldquo;{quoteFor(id, run)}&rdquo;</>}</blockquote>
                  </div>
                ))}
              </div>
              <span className="small">{s.label === "web" ? "From the job posting" : `${who}, said aloud`}</span>
            </li>
          ))}
        </ol>
      ) : (
        <StateBlock title="No kept claims yet">
          <p>Answer the flagged lines, then come back.</p>
        </StateBlock>
      )}
      <div className="no-print">
        <button className="btn" onClick={() => { track("cta_clicked", { cta_name: "Print", surface: "defend", destination: "print" }); window.print(); }}>
          Print
        </button>
      </div>
    </section>
  );
}
