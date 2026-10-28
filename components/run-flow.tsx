"use client";

/**
 * C4 input and run flow: story bank, the role, run progress, then the proof view.
 * The browser holds the run (plan section 3). Run edits go through one reducer over Run.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { splitBank } from "@/lib/engine/bank";
import { RunSchema, type Question, type Run, type StoryLine } from "@/lib/engine/schema";
import { track } from "@/lib/analytics";
import * as api from "@/lib/run/client";
import { runReducer } from "@/lib/run/state";
import { RunSteps, StateBlock, TopBar, type StepState } from "./brand";
import { BaselineView } from "./baseline";
import { DefendView, ProofView } from "./proof-view";
import { TimerBadge, useActiveTimer } from "./use-active-timer";

type Stage = "bank" | "role" | "progress" | "proof" | "defend" | "baseline" | "cap";
type BankSource = Run["bank_source"];
type Failure = { step: 1 | 2 | 3; code: string; message: string };
type QInput = { text: string; limit: string };

const MAX_BANK_BYTES = 200_000;
const MAX_LINES = 600; // DraftBody limit in lib/routes.ts
const MAX_ESSAYS = 6; // plus the outreach note, 7 questions at most
const OUTREACH: Omit<Question, "id"> = { kind: "outreach_short", text: "A short LinkedIn note to the hiring manager for this role." };

function cta(cta_name: string, surface: Stage, destination: string) {
  track("cta_clicked", { cta_name, surface, destination });
}

export function RunFlow({ persona, local }: { persona: { raw: string; glossary: Record<string, string> }; local: boolean }) {
  const [stage, setStage] = useState<Stage>("bank");
  const [bankText, setBankText] = useState("");
  const [bankSource, setBankSource] = useState<BankSource>("pasted");
  const [glossary, setGlossary] = useState<Record<string, string>>({});
  const [bankError, setBankError] = useState<string | null>(null);
  const [postingUrl, setPostingUrl] = useState("");
  const [qs, setQs] = useState<QInput[]>([{ text: "", limit: "" }]);
  const [outreach, setOutreach] = useState(true);
  const [dns, setDns] = useState(false);
  const [steps, setSteps] = useState<[StepState, StepState, StepState]>(["waiting", "waiting", "waiting"]);
  const [stepStart, setStepStart] = useState(0);
  const [now, setNow] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [thin, setThin] = useState(false);
  const [thinText, setThinText] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [blind, setBlind] = useState(local);
  const [run, dispatch] = useReducer(runReducer, null);
  const timer = useActiveTimer(local && run !== null && (stage === "proof" || stage === "defend"));

  const retryTokenRef = useRef<string | undefined>(undefined); // from a thin_posting refusal
  const researchRef = useRef<api.ResearchData | null>(null);
  const draftRef = useRef<api.DraftData | null>(null);
  const judgedRef = useRef(new Map<string, api.JudgeData>());
  const questionsRef = useRef<Question[]>([]);
  const draftDoneAt = useRef(0);
  const urlInput = useRef<HTMLInputElement>(null);

  const isPersona = bankSource === "persona";
  const lines: StoryLine[] = useMemo(() => (bankText.trim() ? splitBank(bankText, glossary) : []), [bankText, glossary]);

  useEffect(() => {
    if (stage !== "progress" || !steps.includes("running")) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [stage, steps]);

  // Local mode: every change to the run (marks, restores) is written to runs/local.
  useEffect(() => {
    if (!local || !run) return;
    const t = setTimeout(async () => {
      const r = await api.saveLocalRun(run);
      setSavedPath(r.error ? `not saved: ${r.error.code}` : r.data.path);
    }, 600);
    return () => clearTimeout(t);
  }, [run, local]);

  function loadBank(text: string, source: BankSource, g: Record<string, string>) {
    setBankError(null);
    if (new Blob([text]).size > MAX_BANK_BYTES) {
      setBankError("This file is too big. Keep the bank under 200 KB.");
      track("error_shown", { error_type: "bank_too_big", surface: "bank", message: "bank_too_big" });
      return;
    }
    setBankText(text);
    setBankSource(source);
    setGlossary(g);
  }

  async function loadLocalFile() {
    const r = await fetch("/api/bank/local").then((x) => x.json()).catch(() => null);
    if (!r?.data) {
      setBankError("stories/bank.md could not be read.");
      return;
    }
    loadBank(r.data.raw, "file", r.data.glossary);
  }

  function toRole() {
    if (lines.length > MAX_LINES) {
      setBankError(`This bank has ${lines.length} story lines. One run takes ${MAX_LINES} at most.`);
      return;
    }
    track("bank_loaded", { source: bankSource, items: lines.length });
    cta("Next: the role", "bank", "role");
    setStage("role");
  }

  function questionList(): Question[] {
    const essays = qs.filter((q) => q.text.trim()).slice(0, MAX_ESSAYS);
    const out: Question[] = essays.map((q, i) => {
      const limit = Number.parseInt(q.limit, 10);
      return { id: `Q${i + 1}`, kind: "essay", text: q.text.trim(), ...(limit > 0 ? { word_limit: limit } : {}) };
    });
    if (outreach) out.push({ id: `Q${out.length + 1}`, ...OUTREACH });
    return out;
  }

  const urlOk = /^https?:\/\/\S+\.\S+/.test(postingUrl.trim());
  const canRun = urlOk && questionList().length > 0;

  function startRun() {
    questionsRef.current = questionList();
    researchRef.current = null;
    draftRef.current = null;
    judgedRef.current = new Map();
    setSavedPath(null);
    setDns(false);
    track("run_started", { mode: local ? "local" : "live", questions: questionsRef.current.length });
    void go(1);
  }

  function setStep(i: 0 | 1 | 2, st: StepState) {
    setSteps((prev) => {
      const next = [...prev] as [StepState, StepState, StepState];
      next[i] = st;
      return next;
    });
    if (st === "running") {
      setStepStart(Date.now());
      setNow(Date.now());
    }
  }

  function fail(step: 1 | 2 | 3, code: string, message: string) {
    setStep((step - 1) as 0 | 1 | 2, "failed");
    setFailure({ step, code, message });
    track("error_shown", { error_type: code, surface: "progress", message: code });
  }

  async function go(from: 1 | 2 | 3, postingText?: string) {
    setFailure(null);
    setThin(false);
    setStage("progress");
    if (from === 1) setSteps(["waiting", "waiting", "waiting"]);
    const questions = questionsRef.current;

    if (from <= 1) {
      setStep(0, "running");
      const t0 = Date.now();
      const retry = postingText ? retryTokenRef.current : undefined;
      retryTokenRef.current = undefined;
      const r = await api.research({
        posting_url: postingUrl.trim(),
        persona: isPersona,
        ...(postingText ? { posting_text: postingText } : {}),
        ...(retry ? { retry_token: retry } : {}),
      });
      if (r.error) {
        if (r.error.code === "thin_posting") {
          retryTokenRef.current = r.error.retry_token;
          setStep(0, "failed");
          setThin(true);
          track("error_shown", { error_type: "thin_posting", surface: "progress", message: "thin_posting" });
        } else if (r.error.code === "capped_global" || r.error.code === "capped_visitor") {
          const scope = r.error.code === "capped_global" ? "global" : "visitor";
          track("live_cap_reached", { scope });
          track("error_shown", { error_type: r.error.code, surface: "cap", message: r.error.code });
          setStage("cap");
        } else if (r.error.code === "do_not_send") {
          setDns(true);
          setStage("role");
          setSteps(["waiting", "waiting", "waiting"]);
          track("error_shown", { error_type: "do_not_send", surface: "role", message: "do_not_send" });
        } else fail(1, r.error.code, r.error.message);
        return;
      }
      researchRef.current = r.data;
      setStep(0, "done");
      track("research_completed", { web_items: r.data.web_lines.length, seconds: Math.round((Date.now() - t0) / 1000) });
    }
    const rs = researchRef.current as api.ResearchData;

    if (from <= 2) {
      setStep(1, "running");
      const r = await api.draft({ run_token: rs.run_token, company: rs.company, story_lines: lines, web_lines: rs.web_lines, questions });
      if (r.error) return fail(2, r.error.code, r.error.message);
      draftRef.current = r.data;
      judgedRef.current = new Map();
      setStep(1, "done");
    }
    const dr = draftRef.current as api.DraftData;

    setStep(2, "running");
    const t3 = Date.now();
    const j = await api.judgeAll({ run_token: rs.run_token, company: rs.company, story_lines: lines, web_lines: rs.web_lines, questions, drafts: dr.drafts }, judgedRef.current);
    if (j.error) return fail(3, j.error.code, j.error.message);
    setStep(2, "done");

    const judged = questions.map((q) => judgedRef.current.get(q.id) as api.JudgeData);
    const judgeUsage = judged.reduce(
      (u, x) => ({ tokens: u.tokens + x.usage.tokens, seconds: u.seconds + x.usage.seconds, cost_estimate: u.cost_estimate + x.usage.cost_estimate }),
      { tokens: 0, seconds: 0, cost_estimate: 0 },
    );
    const built = RunSchema.parse({
      run_id: `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`,
      mode: local ? "local" : "live",
      persona: isPersona,
      bank_source: bankSource,
      posting_url: postingUrl.trim(),
      company: rs.company,
      steps: { research: "done", draft: "done", judge: "done" },
      fallback_model: dr.fallback_model,
      usage: { research: rs.usage, draft: dr.usage, judge: judgeUsage },
      timer_active_seconds: 0,
      story_lines: lines,
      web_lines: rs.web_lines,
      questions,
      answers: judged.map((x) => x.answer),
    });
    const all = built.answers.flatMap((a) => a.sentences);
    track("draft_completed", {
      sentences: all.length,
      kept: all.filter((s) => s.status === "kept").length,
      cut: all.filter((s) => s.status === "cut").length,
      spoken: all.filter((s) => s.label === "spoken").length,
      web: all.filter((s) => s.label === "web").length,
      inference: all.filter((s) => s.label === "inference").length,
      generic: all.filter((s) => s.generic).length,
      seconds: Math.round((Date.now() - t3) / 1000),
      retries: dr.retries,
      unanswered: built.answers.filter((a) => a.unanswered).length,
      fallback_model: built.fallback_model,
    });
    draftDoneAt.current = Date.now();
    dispatch({ type: "set", run: built });
    setBlind(local);
    setStage("proof");
  }

  const actions = {
    onMark: (id: string, verdict: "true" | "false", blindMark = false) => {
      const s = run?.answers.flatMap((a) => a.sentences).find((x) => x.id === id);
      if (s) track("sentence_marked", { label: s.label, status: s.status, verdict, blind: blindMark });
      dispatch({ type: "mark", id, verdict, blind: blindMark });
    },
    onRestore: (id: string) => {
      const s = run?.answers.flatMap((a) => a.sentences).find((x) => x.id === id);
      if (s) track("cut_restored", { label: s.label });
      dispatch({ type: "restore", id });
    },
    onCutAgain: (id: string) => {
      cta("Cut again", "proof", "proof");
      dispatch({ type: "cutAgain", id });
    },
  };

  const sampleBanner = isPersona ? (
    <div className="banner">
      <span className="tag sample">Fictional sample</span>Meera Iyer · Senior PM · logistics software
    </div>
  ) : null;

  return (
    <>
      <TopBar right={<span className="meta">{local ? "Local run" : "Live run"}</span>} />
      <main className={`wrap${stage === "proof" ? " wide" : ""}`}>
        {stage === "bank" ? (
          <section className="stack" aria-labelledby="bank-h">
            {sampleBanner}
            <div>
              <h1 id="bank-h" className="h1">{lines.length ? `${lines.length} story lines ready` : "Your stories, in your words"}</h1>
              <p className="helper">Dictate with Wispr Flow straight into this box, or paste a file. Speak in short parts. Say only what is true.</p>
            </div>
            <div className="field">
              <label htmlFor="bank">Story bank</label>
              <textarea id="bank" className="textarea" value={bankText} onChange={(e) => loadBank(e.target.value, "pasted", glossary)} />
              {bankError ? <p className="err" role="alert">{bankError}</p> : null}
            </div>
            {lines.length ? (
              <ol className="defend" aria-label="First story lines">
                {lines.slice(0, 3).map((l) => (
                  <li key={l.id}><span className="id">{l.id}</span> <span>{l.text}</span></li>
                ))}
              </ol>
            ) : null}
            <div className="line">
              {lines.length ? (
                <button className="btn action" onClick={toRole}>Next: the role</button>
              ) : (
                <button className="btn action" onClick={() => loadBank(persona.raw, "persona", persona.glossary)}>Use the sample persona</button>
              )}
              <label className="btn sec">
                Open a file
                <input
                  type="file"
                  accept=".md,.txt,text/plain,text/markdown"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) loadBank(await f.text(), "file", {});
                  }}
                />
              </label>
              {local ? <button className="btn sec" onClick={loadLocalFile}>Load stories/bank.md</button> : null}
              {lines.length && !isPersona ? (
                <button className="linkbtn" onClick={() => loadBank(persona.raw, "persona", persona.glossary)}>Use the sample persona</button>
              ) : null}
              {lines.length ? <button className="linkbtn" onClick={() => loadBank("", "pasted", {})}>Clear</button> : null}
            </div>
            {local ? (
              <div>
                <button className="linkbtn" onClick={() => setStage("baseline")}>Baseline mode: time how long a plain AI draft takes to fix</button>
              </div>
            ) : null}
          </section>
        ) : null}

        {stage === "role" ? (
          <section className="stack" aria-labelledby="role-h">
            {sampleBanner}
            <div>
              <button className="linkbtn" onClick={() => setStage("bank")}>Back to your stories</button>
              <h1 id="role-h" className="h1">The role</h1>
              <p className="helper">Posting link. Paste each question from the form. We add a short outreach note for you.</p>
            </div>
            {dns ? (
              <StateBlock
                title="This company is on your do-not-send list"
                action={
                  <button className="btn sec" onClick={() => { cta("Change company", "role", "role"); setDns(false); setPostingUrl(""); urlInput.current?.focus(); }}>
                    Change company
                  </button>
                }
              >
                <p>Nothing was sent.</p>
              </StateBlock>
            ) : null}
            <div className="field">
              <label htmlFor="url">Posting link</label>
              <input id="url" ref={urlInput} className="input" type="url" inputMode="url" placeholder="https://" value={postingUrl} onChange={(e) => { setPostingUrl(e.target.value); setDns(false); }} />
            </div>
            <div className="qlist">
              {qs.map((q, i) => (
                <div className="qcard" key={i}>
                  <div className="field">
                    <label htmlFor={`q${i}`}>Question {i + 1}</label>
                    <textarea id={`q${i}`} className="textarea short" value={q.text} onChange={(e) => setQs(qs.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
                  </div>
                  <div className="line">
                    <div className="field">
                      <label htmlFor={`l${i}`}>Word limit</label>
                      <input id={`l${i}`} className="input" style={{ width: 120 }} inputMode="numeric" value={q.limit} onChange={(e) => setQs(qs.map((x, k) => (k === i ? { ...x, limit: e.target.value.replace(/\D/g, "") } : x)))} />
                      <small>Leave empty if the form has none.</small>
                    </div>
                    {qs.length > 1 ? <button className="linkbtn" onClick={() => setQs(qs.filter((_, k) => k !== i))}>Remove</button> : null}
                  </div>
                </div>
              ))}
              {qs.length < MAX_ESSAYS ? <div><button className="btn sec" onClick={() => setQs([...qs, { text: "", limit: "" }])}>Add a question</button></div> : null}
              <label className="line" style={{ minHeight: 44 }}>
                <input type="checkbox" checked={outreach} onChange={(e) => setOutreach(e.target.checked)} style={{ width: 22, height: 22 }} />
                <span>Add a short outreach note to the hiring manager</span>
              </label>
            </div>
            <p className="helper">
              {local
                ? "Local run. Text is sent to Nebius and Tavily to run the draft. The result is saved to runs/local on this machine only."
                : "Text is sent to Nebius and Tavily to run the draft, and stored nowhere."}
            </p>
            <div><button className="btn action" disabled={!canRun} onClick={startRun}>Check my answers</button></div>
          </section>
        ) : null}

        {stage === "progress" ? (
          <section className="stack" aria-labelledby="prog-h">
            <h1 id="prog-h" className="h1">Checking your draft</h1>
            <RunSteps steps={steps} seconds={Math.max(0, Math.round((now - stepStart) / 1000))} />
            {!failure && !thin ? <p className="helper">About a minute.</p> : null}
            {thin ? (
              <StateBlock
                title="We could not read this page"
                action={
                  <button className="btn action" disabled={thinText.trim().split(/\s+/).length < 150} onClick={() => { cta("Use this text", "progress", "progress"); void go(1, thinText); }}>
                    Use this text
                  </button>
                }
              >
                <p>Some job sites block reading. Paste the posting text here.</p>
                <label htmlFor="thin" className="sr-only">Posting text</label>
                <textarea id="thin" className="textarea" value={thinText} onChange={(e) => setThinText(e.target.value)} />
              </StateBlock>
            ) : null}
            {failure ? (
              <StateBlock
                title={`Step ${failure.step} did not finish`}
                action={
                  <button className="btn action" onClick={() => { cta(`Try step ${failure.step} again`, "progress", "progress"); void go(failure.step); }}>
                    Try step {failure.step} again
                  </button>
                }
              >
                <p>{failure.step > 1 ? "Earlier steps are saved. You will not lose them." : failure.message}</p>
                <p className="id">{failure.code}</p>
              </StateBlock>
            ) : null}
            {failure || thin ? <div><button className="linkbtn" onClick={() => setStage("role")}>Back to the role</button></div> : null}
          </section>
        ) : null}

        {stage === "proof" && run ? (
          <ProofView
            run={run}
            actions={actions}
            banner={sampleBanner}
            readyAt={draftDoneAt.current}
            onDefend={() => setStage("defend")}
            onNewRun={() => setStage("role")}
            onAddStory={() => setStage("bank")}
            blind={blind}
            onShowLabels={() => setBlind(false)}
            // H2: active seconds from the draft shown to the latest copy, saved with the run.
            onCopied={() => dispatch({ type: "timer", seconds: timer.read() })}
            footer={
              local ? (
                <>
                  <TimerBadge seconds={timer.seconds} hidden={timer.hidden} />
                  {savedPath ? <span className="saved">{savedPath}</span> : null}
                </>
              ) : null
            }
          />
        ) : null}

        {stage === "defend" && run ? <DefendView run={run} banner={sampleBanner} onBack={() => setStage("proof")} /> : null}

        {stage === "baseline" ? <BaselineView onBack={() => setStage("bank")} /> : null}

        {stage === "cap" ? (
          <StateBlock
            title="Today's live runs are used up"
            action={
              <a className="btn action" href="/sample" onClick={() => cta("See the saved run", "cap", "replay")}>
                See the saved run
              </a>
            }
          >
            <p>The saved run uses the same engine. Live runs reset at midnight UTC.</p>
          </StateBlock>
        ) : null}
      </main>
    </>
  );
}
