/**
 * Pure changes to a finished Run: marks, restore, cut again, counts, clipboard text.
 * The proof view's reducer calls these. A changed Run is always a new object.
 */
import { extractNumbers } from "../engine/numbers";
import type { Answer, Run, Sentence, StoryLine } from "../engine/schema";

type Verdict = Sentence["verdict"];

function shown(s: Sentence): boolean {
  return s.status === "kept" || s.status === "restored";
}

/** Plain text for the form: kept and restored lines only, no marks, IDs or tags (SPEC section 6). */
export function answerText(a: Answer): string {
  return a.sentences.filter(shown).map((s) => s.text.trim()).join(" ");
}

function recount(a: Answer): Answer {
  const text = answerText(a);
  return { ...a, char_count: text.length, word_count: text.split(/\s+/).filter(Boolean).length };
}

function editSentence(run: Run, id: string, change: (s: Sentence) => Sentence): Run {
  return {
    ...run,
    answers: run.answers.map((a) =>
      a.sentences.some((s) => s.id === id) ? recount({ ...a, sentences: a.sentences.map((s) => (s.id === id ? change(s) : s)) }) : a,
    ),
  };
}

/** True or False from Gaurav. Pressing the same mark again clears it. Nothing else changes (SPEC section 4, Disagreement). */
export function markSentence(run: Run, id: string, verdict: Exclude<Verdict, "none">, blind = false): Run {
  return editSentence(run, id, (s) => (s.verdict === verdict ? { ...s, verdict: "none", marked_blind: false } : { ...s, verdict, marked_blind: blind }));
}

export function restoreSentence(run: Run, id: string): Run {
  return editSentence(run, id, (s) => (s.status === "cut" ? { ...s, status: "restored" } : s));
}

export function cutAgain(run: Run, id: string): Run {
  return editSentence(run, id, (s) => (s.status === "restored" ? { ...s, status: "cut" } : s));
}

export type Counts = { kept: number; cut: number; fromWords: number; notBacked: number; generic: number };

/** Plain counts, never a ratio or score. "Not backed" is a shown line with no spoken or web proof. */
export function counts(a: Answer): Counts {
  const on = a.sentences.filter(shown);
  return {
    kept: a.sentences.filter((s) => s.status === "kept").length,
    cut: a.sentences.filter((s) => s.status === "cut").length,
    fromWords: on.filter((s) => s.status === "kept" && s.label === "spoken").length,
    notBacked: on.filter((s) => s.status === "restored" || s.label === "inference").length,
    generic: on.filter((s) => s.generic).length,
  };
}

/** The words shown under a claim. A quote must hold every number it backs, else show the full cited lines. */
export function shownQuote(s: Sentence, run: Run): string | null {
  const quote = s.quote?.trim();
  if (quote) {
    const inQuote = new Set(extractNumbers(quote));
    if (s.number_check.numbers.every((n) => inQuote.has(n))) return quote;
  }
  const lines = [...run.story_lines, ...run.web_lines];
  const cited = s.source_ids.map((id) => lines.find((l) => l.id === id)?.text).filter(Boolean);
  return cited.length ? cited.join(" ") : null;
}

/** v2: the user's own words. The line is shown (as restored) and stays "not checked" until a recheck. */
export function editText(run: Run, id: string, text: string): Run {
  return editSentence(run, id, (s) => ({ ...s, text: text.trim(), edited: true, status: "restored" }));
}

/** v2: a line back from /api/line (gap answer or recheck) takes the old line's place. */
export function replaceSentence(run: Run, next: Sentence): Run {
  return editSentence(run, next.id, () => next);
}

export type RunAction =
  | { type: "set"; run: Run }
  | { type: "edit"; id: string; text: string }
  | { type: "replace"; sentence: Sentence }
  | { type: "addLines"; lines: StoryLine[] }
  | { type: "mark"; id: string; verdict: "true" | "false"; blind?: boolean }
  | { type: "restore"; id: string }
  | { type: "cutAgain"; id: string }
  | { type: "timer"; seconds: number };

/** The one reducer over Run (plan section 7), used by the run flow and the saved run. */
export function runReducer(run: Run | null, a: RunAction): Run | null {
  if (a.type === "set") return a.run;
  if (!run) return run;
  if (a.type === "mark") return markSentence(run, a.id, a.verdict, a.blind);
  if (a.type === "timer") return { ...run, timer_active_seconds: a.seconds };
  if (a.type === "edit") return editText(run, a.id, a.text);
  if (a.type === "replace") return replaceSentence(run, a.sentence);
  if (a.type === "addLines") return { ...run, story_lines: [...run.story_lines, ...a.lines] };
  if (a.type === "restore") return restoreSentence(run, a.id);
  return cutAgain(run, a.id);
}
