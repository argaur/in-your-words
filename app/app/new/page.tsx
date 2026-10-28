"use client";

/**
 * v2 screens 7 and 8: a new application. The posting link first; "Get questions" reads Lever and
 * Greenhouse forms. Paste is always there, as text or a screenshot. Then the user checks the
 * questions, and the run goes: research, draft, check.
 */
import { useEffect, useState } from "react";
import { ErrorLine, RunSteps, StateBlock, type StepState } from "@/components/brand";
import { AppShell } from "@/components/v2/shell";
import { useWorkspace } from "@/components/v2/workspace";
import { track } from "@/lib/analytics";
import { RunSchema, type Question } from "@/lib/engine/schema";
import { isEssay, textQuestions } from "@/lib/intake";
import * as api from "@/lib/run/client";
import { stepMessage } from "@/lib/run/errors";
import { runApplication, type RunFailure } from "@/lib/run/execute";
import saved from "@/samples/meera/run.json";

type Stage = "link" | "questions" | "progress";
type QRow = { text: string; limit: string; on: boolean };

const MAX_ESSAYS = 6; // plus the outreach note: the draft route takes 7 questions at most
// F03: the demo can start from the job in the saved sample run, so a judge never needs a posting of their own.
const SAMPLE = RunSchema.parse(saved);

const OUTREACH: Omit<Question, "id"> = { kind: "outreach_short", text: "A short LinkedIn note to the hiring manager for this role." };

function cta(cta_name: string, surface: string, destination: string) {
  track("cta_clicked", { cta_name, surface, destination });
}

/** Screenshots are shrunk in the browser to a JPEG under about 1 MB before they are sent. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function NewApplication() {
  const { lines, seed, local, saveApp } = useWorkspace();
  const [stage, setStage] = useState<Stage>("link");
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState<"text" | "image">("text");
  const [pasteText, setPasteText] = useState("");
  const [note, setNote] = useState<{ text: string; field: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<QRow[]>([]);
  const [outreach, setOutreach] = useState(true);
  const [steps, setSteps] = useState<[StepState, StepState, StepState]>(["waiting", "waiting", "waiting"]);
  const [started, setStarted] = useState(0);
  const [now, setNow] = useState(0);
  const [failure, setFailure] = useState<RunFailure | null>(null);
  const [thinText, setThinText] = useState("");

  const urlOk = /^https?:\/\/\S+\.\S+/.test(url.trim());

  useEffect(() => {
    if (stage !== "progress" || !steps.includes("running")) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stage, steps]);

  function found(qs: api.FoundQuestion[], source: "scrape" | "text" | "image", reason = "ok") {
    track("questions_found", { source, count: qs.length, reason });
    if (!qs.length) return false;
    setRows(qs.map((q) => ({ text: q.text, limit: q.word_limit ? String(q.word_limit) : "", on: isEssay(q.text) })));
    setStage("questions");
    return true;
  }

  async function getQuestions() {
    cta("Get questions", "new", "questions");
    setBusy(true);
    setNote(null);
    const r = await api.readQuestions(url.trim());
    setBusy(false);
    if (r.error) return setNote({ text: "Could not reach the page. Paste the questions below instead.", field: true });
    if (found(r.data.questions, "scrape", r.data.reason)) return;
    setNote({
      text:
        r.data.reason === "unsupported"
          ? "We can read questions from Lever and Greenhouse links. For this site, paste them below as text or a screenshot."
          : "We could not read the questions from this page. Paste them below as text or a screenshot.",
      field: true,
    });
  }

  async function readImage(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setNote({ text: "That is not an image. Use a PNG or JPEG screenshot.", field: false });
    setBusy(true);
    setNote(null);
    const r = await api.readImageQuestions(await shrink(file));
    setBusy(false);
    if (r.error) {
      track("error_shown", { error_type: r.error.code, surface: "new", message: r.error.code });
      return setNote({ text: r.error.code === "capped_visitor" ? "Today's screenshot reads are used up. Paste the questions as text." : "We could not read that screenshot. Paste the questions as text.", field: false });
    }
    if (!found(r.data.questions, "image")) setNote({ text: "No questions found in that screenshot. Try a closer crop, or paste the text.", field: false });
  }

  function questionList(): Question[] {
    const essays = rows.filter((r) => r.on && r.text.trim()).slice(0, MAX_ESSAYS);
    const out: Question[] = essays.map((r, i) => {
      const limit = Number.parseInt(r.limit, 10);
      return { id: `Q${i + 1}`, kind: "essay", text: r.text.trim(), ...(limit > 0 ? { word_limit: limit } : {}) };
    });
    if (outreach) out.push({ id: `Q${out.length + 1}`, ...OUTREACH });
    return out;
  }

  async function start(postingText?: string, retry?: string) {
    setFailure(null);
    setStage("progress");
    setSteps(["waiting", "waiting", "waiting"]);
    const r = await runApplication({
      posting_url: url.trim(),
      posting_text: postingText,
      retry_token: retry,
      questions: questionList(),
      lines,
      persona: seed.persona,
      local,
      onStep: (i, st) => {
        setSteps((prev) => {
          const next = [...prev] as [StepState, StepState, StepState];
          next[i] = st;
          return next;
        });
        if (st === "running") {
          setStarted(Date.now());
          setNow(Date.now());
        }
      },
    });
    if ("failure" in r) {
      setFailure(r.failure);
      track("error_shown", { error_type: r.failure.code, surface: "progress", message: r.failure.code });
      return;
    }
    const id = r.run.run_id;
    saveApp({ id, created_at: new Date().toISOString(), run: r.run, run_token: r.run_token });
    window.location.href = `/app/a/${encodeURIComponent(id)}`;
  }


  function useSample() {
    cta("Use the sample job", "new", "questions");
    setUrl(SAMPLE.posting_url);
    setNote(null);
    setOutreach(SAMPLE.questions.some((q) => q.kind !== "essay"));
    found(
      SAMPLE.questions.filter((q) => q.kind === "essay").map((q) => ({ text: q.text, word_limit: q.word_limit })),
      "text",
      "sample",
    );
  }

  const picked = rows.filter((r) => r.on).length;
  const fieldErr = note?.field ? "url-err" : undefined;

  return (
    <AppShell here="new">
      {stage === "link" ? (
        <section className="stack loose" aria-labelledby="new-h">
          <div className="head-block">
            <span className="kicker">New application</span>
            <h1 id="new-h" className="title">Where are you applying?</h1>
            <p className="meta">Paste the job link. We read the form questions for you.</p>
          </div>
          <div className="stack">
            <div className="field">
              <label htmlFor="url">Job posting link</label>
              <input
                id="url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={note?.field ? true : undefined}
                aria-describedby={fieldErr}
              />
            </div>
            {note?.field ? <ErrorLine id="url-err">{note.text}</ErrorLine> : null}
            <div className="row">
              <button className="btn" disabled={!urlOk || busy} aria-busy={busy || undefined} onClick={getQuestions}>
                {busy ? (
                  <>
                    <span className="spin" aria-hidden="true" />
                    Reading...
                  </>
                ) : (
                  "Get questions"
                )}
              </button>
              {seed.persona ? (
                <button className="btn sec" onClick={useSample}>
                  Use the sample job
                </button>
              ) : null}
            </div>
          </div>

          <div className="stack">
            <div className="head-block">
              <h2 className="sub">Or paste the questions</h2>
              <p className="meta">Have the form open already, or a screenshot? Paste it here.</p>
            </div>
            <div className="seg" role="group" aria-label="Paste as">
              <button aria-pressed={tab === "text"} onClick={() => setTab("text")}>Text</button>
              <button aria-pressed={tab === "image"} onClick={() => setTab("image")}>Screenshot</button>
            </div>
            {tab === "text" ? (
              <>
                <div className="field">
                  <label htmlFor="ptext">Questions, one per line</label>
                  <textarea id="ptext" className="short" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
                </div>
                <div>
                  <button
                    className="btn sec"
                    disabled={!urlOk || !textQuestions(pasteText).length}
                    onClick={() => {
                      cta("Use these questions", "new", "questions");
                      found(textQuestions(pasteText), "text");
                    }}
                  >
                    Use these questions
                  </button>
                </div>
              </>
            ) : (
              <div
                className="drop-zone"
                tabIndex={0}
                onPaste={(e) => {
                  const item = [...e.clipboardData.items].find((x) => x.type.startsWith("image/"));
                  if (item) void readImage(item.getAsFile());
                }}
              >
                <p>Paste a screenshot here (Ctrl+V), or choose a file.</p>
                <label className={`btn sec${!urlOk || busy ? " off" : ""}`}>
                  {busy ? "Reading..." : "Choose a screenshot"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr" disabled={!urlOk || busy} onChange={(e) => void readImage(e.target.files?.[0])} />
                </label>
                <span className="hint">Read by Nemotron VL. The image is not saved.</span>
              </div>
            )}
            {note && !note.field ? <ErrorLine>{note.text}</ErrorLine> : null}
            {!urlOk ? <p className="hint">Add the job link first. We use it to read about the company.</p> : null}
          </div>
        </section>
      ) : null}

      {stage === "questions" ? (
        <section className="stack loose" aria-labelledby="q-h">
          <div className="head-block">
            <div>
              <button className="textbtn" onClick={() => setStage("link")}>Back</button>
            </div>
            <h1 id="q-h" className="title">{rows.length === 1 ? "1 question found" : `${rows.length} questions found`}</h1>
            <p className="meta">Questions that need a story are ticked. Untick form facts like years or notice period: you answer those yourself.</p>
          </div>
          <div>
            {rows.map((r, i) => (
              <div className="qrow" key={i}>
                <label className="check">
                  <input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
                  <span className="sr">Draft an answer for question {i + 1}</span>
                </label>
                <div className="fields">
                  <div className="field">
                    <label htmlFor={`q${i}`}>Question {i + 1}</label>
                    <textarea id={`q${i}`} className="short" value={r.text} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
                  </div>
                  <div className="field">
                    <label htmlFor={`l${i}`}>Word limit</label>
                    <input id={`l${i}`} className="narrow" inputMode="numeric" value={r.limit} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, limit: e.target.value.replace(/\D/g, "") } : x)))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div>
            <button className="btn sec" onClick={() => setRows([...rows, { text: "", limit: "", on: true }])}>Add a question</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={outreach} onChange={(e) => setOutreach(e.target.checked)} />
            <span><b>Add a short note to the hiring manager</b></span>
          </label>
          <div className="bottom-bar">
            <button className="btn" disabled={!questionList().length} onClick={() => { cta("Draft my answers", "questions", "progress"); void start(); }}>
              Draft my answers
            </button>
            <span className="small">
              {picked > MAX_ESSAYS ? `The first ${MAX_ESSAYS} ticked questions are drafted.` : `${lines.length} story lines · about a minute`}
            </span>
          </div>
        </section>
      ) : null}

      {stage === "progress" ? (
        <section className="stack loose" aria-labelledby="p-h">
          <h1 id="p-h" className="title">Writing from your words</h1>
          <RunSteps steps={steps} seconds={Math.max(0, Math.round((now - started) / 1000))} />
          {!failure ? <p className="meta">About a minute. Every sentence is checked against your stories.</p> : null}
          {failure?.code === "thin_posting" ? (
            <StateBlock
              title="We could not read the job page"
              action={
                <button className="btn" disabled={thinText.trim().split(/\s+/).length < 150} onClick={() => void start(thinText, failure.retry_token)}>
                  Use this text
                </button>
              }
            >
              <p>Some job sites block reading. Paste the job description here (150 words or more).</p>
              <div className="field">
                <label htmlFor="thin" className="sr">Job description</label>
                <textarea id="thin" value={thinText} onChange={(e) => setThinText(e.target.value)} />
              </div>
            </StateBlock>
          ) : failure?.code === "capped_visitor" || failure?.code === "capped_global" ? (
            <StateBlock title="Today's live runs are used up" action={<a className="btn" href="/app">Back home</a>}>
              <p>The demo allows a few runs a day. They reset at midnight UTC. The example application on your home page shows a full result.</p>
            </StateBlock>
          ) : failure ? (
            <StateBlock alert title={`Step ${failure.step} did not finish`} action={<button className="btn" onClick={() => void start()}>Try again</button>}>
              <p>{stepMessage(failure.code, failure.message, local)}</p>
              {local ? <p className="small">{failure.code}</p> : null}
            </StateBlock>
          ) : null}
          {failure ? <div><button className="textbtn" onClick={() => setStage("questions")}>Back to the questions</button></div> : null}
        </section>
      ) : null}
    </AppShell>
  );
}
