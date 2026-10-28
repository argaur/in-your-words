"use client";

/**
 * v2 landing (SPEC section 4, row 1): the headline sits on one real answer from the saved sample
 * run, a backed line with its sticker open and a flagged line with its question, then the way in.
 * No entrance animation: the first paint is the final layout (C29).
 */
import type { Run, Sentence } from "@/lib/engine/schema";
import { track } from "@/lib/analytics";
import { askFor } from "@/lib/engine/voice";
import { TopBar } from "../brand";
import { SOON, USE_CASES } from "@/lib/product";
import { quoteFor } from "./lines";

// The whole platform on the landing: what is live today, then what comes next (Gaurav, 2026-10-28).
const LIVE = USE_CASES.find((u) => u.live)!;
const SOON_WRITING = SOON.filter((s) => USE_CASES.some((u) => !u.live && u.slug === s.slug));
const SOON_TOOLS = SOON.filter((s) => !USE_CASES.some((u) => u.slug === s.slug));

function cta(cta_name: string, destination: string) {
  track("cta_clicked", { cta_name, surface: "landing", destination });
}

// The flagged line's reason in plain words (approved 2026-10-27). The engine's own reason says "evidence" and uses symbols.
const LANDING_REASON = "She said 19 to 11 minutes. That is 42 percent, not half.";

function pickBacked(run: Run): Sentence | undefined {
  const all = run.answers.flatMap((a) => a.sentences);
  const numbered = all.filter((s) => s.status === "kept" && s.label === "spoken" && s.number_check.numbers.length);
  return numbered.find((s) => s.source_ids.length === 2 && s.number_check.numbers.length >= 3) ?? numbered[0];
}

export function LandingV2({ saved }: { saved: Run }) {
  const kept = pickBacked(saved);
  const flagged = saved.answers.flatMap((a) => a.sentences).find((s) => s.status === "cut" && s.label !== "web");
  // One sticker opens on the landing: the line that carries the numbers.
  const shownId = kept?.source_ids.find((id) => kept.number_check.numbers.every((n) => quoteFor(id, saved).includes(n))) ?? kept?.source_ids.at(-1);

  return (
    <>
      <TopBar
        right={
          <a className="icon-btn shell-btn" href="/login" onClick={() => cta("Log in", "login")}>
            Log in
          </a>
        }
      />
      <main className="wrap wide stack loose">
        <section className="hero" aria-labelledby="hero-h">
          <div className="head-block" style={{ gridColumn: "1 / -1" }}>
            <h1 id="hero-h">AI writes it. Every claim is something you said.</h1>
            <p className="sub">Job application answers, drafted only from stories you said out loud.</p>
          </div>
          <div className="actions">
            <a className="btn" href="/login" onClick={() => cta("Try the demo", "login")}>
              Try the demo
            </a>
            <a className="btn sec" href="/sample" onClick={() => cta("See a checked answer", "replay")}>
              See a checked answer
            </a>
          </div>
          <div className="proof">
            <div className="sheet">
              <div className="proof-head">
                <span>Meera Iyer (fictional) · {saved.company} answers</span>
              </div>
              {kept ? (
                <div className="ln" data-open="true">
                  <p className="tx">
                    {kept.text}
                    <span className="stks">
                      {kept.source_ids.map((id) => (
                        <span key={id} className="stk">{id}</span>
                      ))}
                    </span>
                  </p>
                  {shownId ? (
                    <div className="exh">
                      <div className="exh-row">
                        <span className="stk big">{shownId}</span>
                        <blockquote>&ldquo;{quoteFor(shownId, saved)}&rdquo;</blockquote>
                      </div>
                      <div className="exh-meta">Her words, said aloud</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {flagged ? (
                <div className="ln flag">
                  <p className="tx">
                    {flagged.text}
                    <span className="stks">
                      <span className="stk empty">Needs your words</span>
                    </span>
                  </p>
                  <div className="gap">
                    <p className="reason">{LANDING_REASON}</p>
                    <p className="ask">
                      <span className="asked">Asked back</span>
                      {flagged.ask ?? askFor(flagged, flagged.number_check)}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <aside className="landing-log" aria-label="Where each line came from">
            <div className="list">
              <h3>Where each line came from</h3>
              <ol>
                {flagged ? (
                  <li>
                    <span className="stk empty">&nbsp;?&nbsp;</span>
                    <span>
                      Nothing yet. {flagged.ask ?? askFor(flagged, flagged.number_check)}
                      <span className="k">Needs your words</span>
                    </span>
                  </li>
                ) : null}
                {kept?.source_ids.map((id) => (
                  <li key={id} data-on={id === shownId}>
                    <span className="stk">{id}</span>
                    <span>
                      &ldquo;{quoteFor(id, saved)}&rdquo;
                      <span className="k">Said aloud</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </section>
        <ol className="lsteps">
          <li>Speak your stories once. Wispr Flow types them in.</li>
          <li>Paste a job link. It finds the questions and drafts your answers.</li>
          <li>Anything you never said gets a question, not a guess.</li>
        </ol>

        <section className="stack loose band-sec" id="meaning" aria-labelledby="meaning-h">
          <h2 id="meaning-h" className="hd">What &ldquo;in your words&rdquo; means</h2>
          <div className="twocol">
            <div className="stack">
              <p className="lead">AI can write anything. That is the problem.</p>
              <p className="meta">
                It makes claims you never made, in a voice that is not yours. When someone asks about one, you cannot back it up.
              </p>
            </div>
            <div className="stack">
              <p className="lead">Say your stories once, by voice.</p>
              <p className="meta">Every line gets a number. Everything written for you comes only from those lines.</p>
            </div>
          </div>
          <ul className="promises">
            <li>
              <span className="stk">S23</span>
              <span>Every claim shows the words you said.</span>
            </li>
            <li>
              <span className="stk empty">Needs your words</span>
              <span>Anything you never said gets a question, not a guess.</span>
            </li>
            <li>
              <span className="tag">Defend sheet</span>
              <span>A defend sheet gets you ready for the interview.</span>
            </li>
          </ul>
        </section>

        <section className="stack loose band-sec" id="scope" aria-labelledby="scope-h">
          <h2 id="scope-h" className="hd">One story bank, many places</h2>
          <div className="twocol">
            <div className="stack">
              <h3 className="sub">Live today</h3>
              <ul className="list-rows">
                <li>
                  <span className="row-text">
                    <b>{LIVE.name}</b>
                    <span>{LIVE.line} A gap question you answer by voice, and a defend sheet.</span>
                  </span>
                  <span className="tag">Live</span>
                </li>
              </ul>
              <div className="actions">
                <a className="btn sec" href="/login" onClick={() => cta("Try it now", "login")}>
                  Try it now
                </a>
              </div>
            </div>
            <div className="stack">
              <h3 className="sub">Coming soon</h3>
              <ul className="list-rows">
                {[...SOON_WRITING, ...SOON_TOOLS].map((s) => (
                  <li key={s.slug}>
                    <span className="row-text">
                      <b>{s.name}</b>
                      <span>{s.what}</span>
                    </span>
                    <span className="tag">Coming soon</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <p className="meta">
          <a href="/docs">How it works</a>
        </p>
      </main>
    </>
  );
}
