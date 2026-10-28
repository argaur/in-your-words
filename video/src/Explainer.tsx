/**
 * In Your Words landing explainer, 55 s, 16:9, captions only (STORYBOARD.md).
 * Every value derives from the frame number. Copy is verbatim from samples/meera/run.json
 * and components/v2/landing.tsx: never edit a quote here to fit a scene.
 */
import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { loadFont as loadLabel } from "@remotion/google-fonts/SofiaSansExtraCondensed";
import { loadFont as loadSans } from "@remotion/google-fonts/PublicSans";

const { fontFamily: LABEL } = loadLabel("normal", { weights: ["800"], subsets: ["latin"] });
const { fontFamily: SANS } = loadSans("normal", { weights: ["400", "600", "700"], subsets: ["latin"] });

// Exhibit light tokens (Documentation/design/system/v2/tokens.css). Yellow is stickers and the wordmark only.
const C = {
  ground: "#E9EDF1",
  sheet: "#FFFFFF",
  ink: "#111418",
  ink2: "#46515C",
  rule: "#C3CBD3",
  shell: "#2B3440",
  shellInk: "#F1F3F5",
  shellInk2: "#C3CBD4",
  sticker: "#FFC400",
};

// Verbatim from the saved Flexport run.
const QUOTES: Record<string, string> = {
  S9: "The biggest thing I shipped is an AI triage feature for that exceptions desk.",
  S22: "We piloted it with three customers for six weeks.",
  S23: "Median time to the first action on an exception went from about 19 minutes to about 11 minutes across those three customers.",
};
const OVERCLAIM =
  "I have shipped an AI triage feature with a rigorous evaluation and a pilot that cut median action time nearly in half.";
const BACKED = "A six-week pilot with three customers cut median time to first action from 19 minutes to 11 minutes.";
const REASON = "She said 19 to 11 minutes. That is 42 percent, not half.";
const ASK = "What did you do here? Say it in your own words.";

export const FPS = 30;
const SCENES = [
  { from: 0, len: 150 },
  { from: 150, len: 210 },
  { from: 360, len: 270 },
  { from: 630, len: 360 },
  { from: 990, len: 330 },
  { from: 1320, len: 150 },
  { from: 1470, len: 180 },
];
export const DURATION = 1650;

const ease = Easing.out(Easing.cubic);
const ramp = (f: number, start: number, dur = 12) =>
  interpolate(f, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

/** Fade and a 24 px rise. */
const rise = (f: number, start: number, dur = 12): React.CSSProperties => {
  const p = ramp(f, start, dur);
  return { opacity: p, transform: `translateY(${(1 - p) * 24}px)` };
};

/** Steady typing, in chars per frame. */
const typed = (text: string, f: number, start: number, rate = 1.6) =>
  text.slice(0, Math.max(0, Math.floor((f - start) * rate)));

/** Scene fade out over the last 10 frames, so cuts never pop. */
const out = (f: number, len: number) =>
  interpolate(f, [len - 10, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** A 4 px ink bar under text that draws in from the left. Ink, never yellow: yellow is for stickers. */
const bar = (p: number): React.CSSProperties => ({
  backgroundImage: `linear-gradient(${C.ink}, ${C.ink})`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "0 100%",
  backgroundSize: `${p * 100}% 4px`,
  paddingBottom: 3,
});

const snap = (f: number, at: number) =>
  interpolate(f, [at, at + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

const Sticker: React.FC<{ id: string; f: number; at: number; big?: boolean }> = ({ id, f, at, big }) => {
  const p = snap(f, at);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: big ? 52 : 44,
        padding: big ? "0 16px" : "0 14px",
        background: C.sticker,
        color: C.ink,
        font: `700 ${big ? 30 : 26}px/1 ${SANS}`,
        letterSpacing: ".02em",
        fontVariantNumeric: "tabular-nums",
        clipPath: "polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)",
        borderRadius: 5,
        opacity: p,
        transform: `scale(${0.85 + 0.15 * p})`,
        verticalAlign: 4,
        whiteSpace: "nowrap",
      }}
    >
      {id}
    </span>
  );
};

const EmptySticker: React.FC<{ f: number; at: number; label: string }> = ({ f, at, label }) => {
  const p = snap(f, at);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 48,
        padding: "2px 14px 0",
        outline: `2.5px dashed ${C.ink}`,
        outlineOffset: -2.5,
        borderRadius: 5,
        color: C.ink,
        font: `800 32px/1 ${LABEL}`,
        letterSpacing: ".03em",
        textTransform: "uppercase",
        opacity: p,
        transform: `scale(${0.85 + 0.15 * p})`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
};

/** Keeps a number on the same line as its unit, in the render only. Stored copy stays verbatim. */
const keep = (s: string) => s.replace(/(\d+) minutes/g, "$1 minutes");

/** Marks the numbers 19 and 11. */
const Marked: React.FC<{ text: string; p: number }> = ({ text, p }) => (
  <>
    {keep(text).split(/(\b19\b|\b11\b)/).map((part, i) =>
      part === "19" || part === "11" ? (
        <span key={i} style={{ fontWeight: 700, ...bar(p) }}>
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

const Caption: React.FC<{ text: string; f: number; len: number; at?: number }> = ({ text, f, len, at = 8 }) => (
  <div
    style={{
      position: "absolute",
      left: 160,
      right: 160,
      bottom: 72,
      font: `600 40px/1.3 ${SANS}`,
      color: C.ink,
      opacity: ramp(f, at, 10) * out(f, len),
    }}
  >
    {text}
  </div>
);

const Sheet: React.FC<{ head: string; f: number; children: React.ReactNode; top?: number }> = ({ head, f, children, top = 150 }) => (
  <div
    style={{
      position: "absolute",
      left: 160,
      right: 160,
      top,
      background: C.sheet,
      borderRadius: 5,
      padding: "36px 48px 44px",
      ...rise(f, 0, 14),
    }}
  >
    <div style={{ font: `600 26px/1 ${SANS}`, color: C.ink2, paddingBottom: 22, borderBottom: `1.5px solid ${C.rule}`, marginBottom: 28 }}>
      {head}
    </div>
    {children}
  </div>
);

const Ground: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = C.ground }) => (
  <AbsoluteFill style={{ background: bg, fontFamily: SANS, color: C.ink }}>{children}</AbsoluteFill>
);

// 1. The problem. The headline is the caption.
const Problem: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const h: React.CSSProperties = { font: `800 150px/0.95 ${LABEL}`, textTransform: "uppercase", letterSpacing: ".01em" };
  return (
    <Ground>
      <div style={{ position: "absolute", left: 160, top: 330, opacity: out(f, len) }}>
        <div style={{ ...h, ...rise(f, 10, 14) }}>AI can write anything.</div>
        <div style={{ ...h, color: C.ink2, marginTop: 20, ...rise(f, 50, 14) }}>That is the problem.</div>
      </div>
    </Ground>
  );
};

// 2. A plain AI draft makes a claim she never made.
const Overclaim: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const shown = typed(OVERCLAIM, f, 18);
  const cut = OVERCLAIM.indexOf("nearly in half");
  const under = ramp(f, 110, 16);
  return (
    <Ground>
      <div style={{ opacity: out(f, len) }}>
        <Sheet head="Meera Iyer (fictional) · a first draft" f={f}>
          <p style={{ margin: 0, font: `400 46px/1.45 ${SANS}`, minHeight: 200 }}>
            {shown.slice(0, cut)}
            {shown.length > cut ? <span style={{ ...bar(under), fontWeight: under > 0 ? 700 : 400 }}>{shown.slice(cut)}</span> : null}
          </p>
        </Sheet>
      </div>
      <Caption text="It makes claims you never made." f={f} len={len} at={120} />
    </Ground>
  );
};

// 3. She says her stories once. Every line gets a number.
const Bank: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const rows = [
    { id: "S9", at: 20 },
    { id: "S22", at: 70 },
    { id: "S23", at: 115 },
  ];
  return (
    <Ground>
      <div style={{ opacity: out(f, len) }}>
        <Sheet head="Meera Iyer (fictional) · her story bank, said aloud" f={f}>
          <div style={{ display: "grid", gap: 30 }}>
            {rows.map((r) => {
              const q = keep(QUOTES[r.id]);
              const t = typed(q, f, r.at + 6);
              return (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 24, alignItems: "start", ...rise(f, r.at, 10) }}>
                  <div style={{ paddingTop: 4 }}>
                    <Sticker id={r.id} f={f} at={r.at + 4} />
                  </div>
                  <p style={{ margin: 0, font: `400 38px/1.45 ${SANS}`, minHeight: 55 }}>
                    &ldquo;{t}
                    {t.length === q.length ? "”" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </Sheet>
      </div>
      <Caption text="Say your stories once, by voice. Every line gets a number." f={f} len={len} at={20} />
    </Ground>
  );
};

// 4. A backed line, with her words open under it.
const Backed: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  const open = ramp(f, 80, 14);
  const mark = ramp(f, 170, 18);
  return (
    <Ground>
      <div style={{ opacity: out(f, len) }}>
        <Sheet head="Meera Iyer (fictional) · Flexport answers" f={f}>
          <div style={{ background: `rgba(221,228,235,${open})`, margin: "0 -24px", padding: "20px 24px 24px", borderRadius: 5 }}>
            <p style={{ margin: 0, font: `400 46px/1.45 ${SANS}`, ...rise(f, 12, 12) }}>
              <Marked text={BACKED} p={mark} />{" "}
              <span style={{ display: "inline-flex", gap: 10 }}>
                <Sticker id="S22" f={f} at={40} />
                <Sticker id="S23" f={f} at={50} />
              </span>
            </p>
            <div
              style={{
                marginTop: 26,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 22,
                alignItems: "start",
                opacity: open,
                transform: `translateY(${(1 - open) * -12}px)`,
              }}
            >
              <div style={{ paddingTop: 6 }}>
                <Sticker id="S23" f={f} at={84} big />
              </div>
              <div>
                <p style={{ margin: 0, font: `400 38px/1.45 ${SANS}` }}>
                  &ldquo;<Marked text={QUOTES.S23} p={mark} />&rdquo;
                </p>
                <p style={{ margin: "14px 0 0", font: `600 26px/1 ${SANS}`, color: C.ink2 }}>Her words, said aloud</p>
              </div>
            </div>
          </div>
        </Sheet>
      </div>
      <Caption text="Every claim shows the words you said." f={f} len={len} at={60} />
    </Ground>
  );
};

// 5. The overclaim comes back flagged, with a question instead of a guess.
const Flagged: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  return (
    <Ground>
      <div style={{ opacity: out(f, len) }}>
        <Sheet head="Meera Iyer (fictional) · Flexport answers" f={f}>
          <p
            style={{
              margin: 0,
              font: `400 46px/1.45 ${SANS}`,
              textDecoration: `underline 2.5px dashed ${C.ink2}`,
              textUnderlineOffset: 10,
              ...rise(f, 10, 12),
            }}
          >
            {OVERCLAIM}
          </p>
          <div style={{ marginTop: 20 }}>
            <EmptySticker f={f} at={36} label="Needs your words" />
          </div>
          <p style={{ margin: "30px 0 0", font: `400 36px/1.4 ${SANS}`, color: C.ink2, ...rise(f, 75, 12) }}>{REASON}</p>
          <div style={{ marginTop: 28, ...rise(f, 150, 12) }}>
            <span style={{ display: "block", font: `600 26px/1 ${SANS}`, color: C.ink2, marginBottom: 10 }}>Asked back</span>
            <span style={{ font: `700 40px/1.35 ${SANS}` }}>{ASK}</span>
          </div>
        </Sheet>
      </div>
      <Caption text="Anything you never said gets a question, not a guess." f={f} len={len} at={90} />
    </Ground>
  );
};

// 6. The defend sheet: the claim, then her words.
const Defend: React.FC<{ len: number }> = ({ len }) => {
  const f = useCurrentFrame();
  return (
    <Ground>
      <div style={{ opacity: out(f, len) }}>
        <Sheet head="Defend sheet · Flexport" f={f} top={150}>
          <p style={{ margin: 0, font: `700 40px/1.4 ${SANS}`, ...rise(f, 8, 12) }}>{keep(BACKED)}</p>
          <div style={{ display: "grid", gap: 18, marginTop: 26 }}>
            {(["S22", "S23"] as const).map((id, i) => (
              <div
                key={id}
                style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 22, alignItems: "start", ...rise(f, 30 + i * 20, 10) }}
              >
                <div style={{ paddingTop: 2 }}>
                  <Sticker id={id} f={f} at={32 + i * 20} />
                </div>
                <p style={{ margin: 0, font: `400 34px/1.45 ${SANS}` }}>&ldquo;{keep(QUOTES[id])}&rdquo;</p>
              </div>
            ))}
          </div>
        </Sheet>
      </div>
      <Caption text="A defend sheet gets you ready for the interview." f={f} len={len} at={20} />
    </Ground>
  );
};

// 7. End card on the steel shell.
const End: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Ground bg={C.shell}>
      <div style={{ position: "absolute", left: 160, right: 160, top: 250, color: C.shellInk }}>
        <div
          style={{
            font: `800 84px/1 ${LABEL}`,
            textTransform: "uppercase",
            letterSpacing: ".02em",
            display: "flex",
            alignItems: "center",
            gap: 18,
            ...rise(f, 6, 12),
          }}
        >
          In your
          <span
            style={{
              background: C.sticker,
              color: C.ink,
              padding: "8px 18px 4px",
              borderRadius: 5,
              clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)",
            }}
          >
            words
          </span>
        </div>
        <div style={{ font: `800 104px/1 ${LABEL}`, textTransform: "uppercase", marginTop: 56, ...rise(f, 24, 14) }}>
          <div>AI writes it.</div>
          <div>Every claim is something you said.</div>
        </div>
        <div style={{ font: `700 44px/1 ${SANS}`, marginTop: 64, ...rise(f, 50, 12) }}>Try the demo: inyourwords.vercel.app</div>
        <div style={{ font: `400 28px/1 ${SANS}`, color: C.shellInk2, marginTop: 22, ...rise(f, 60, 12) }}>
          Meera Iyer is fictional. Every line shown is from her saved sample run.
        </div>
      </div>
    </Ground>
  );
};

const PARTS = [Problem, Overclaim, Bank, Backed, Flagged, Defend];

export const Explainer: React.FC = () => (
  <AbsoluteFill style={{ background: C.ground }}>
    {PARTS.map((P, i) => (
      <Sequence key={i} from={SCENES[i].from} durationInFrames={SCENES[i].len}>
        <P len={SCENES[i].len} />
      </Sequence>
    ))}
    <Sequence from={SCENES[6].from} durationInFrames={SCENES[6].len}>
      <End />
    </Sequence>
  </AbsoluteFill>
);
