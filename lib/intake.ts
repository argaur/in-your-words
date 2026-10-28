/**
 * v2 question intake (PRODUCT_V2.md section 6). Lever and Greenhouse expose their form
 * questions publicly, so reading them costs no model call and no Tavily credit. Any other
 * board, or a failed read, falls back to paste: text here, or a screenshot through the vision model.
 */
export type FoundQuestion = { text: string; word_limit?: number };
export type Board = { board: "lever" | "greenhouse"; apply: string };

export function boardOf(url: string): Board | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (/^jobs(\.eu)?\.lever\.co$/.test(u.hostname) && parts.length >= 2) {
    return { board: "lever", apply: `https://${u.hostname}/${parts[0]}/${parts[1]}/apply` };
  }
  if (/^(boards|job-boards)\.greenhouse\.io$/.test(u.hostname) && parts[1] === "jobs" && /^\d+$/.test(parts[2] ?? "")) {
    return { board: "greenhouse", apply: `https://boards-api.greenhouse.io/v1/boards/${parts[0]}/jobs/${parts[2]}?questions=true` };
  }
  return null;
}

export function limitFrom(text: string): number | undefined {
  const w = /(\d{2,4})\s*words?/i.exec(text);
  if (w) return Number(w[1]);
  const c = /(\d{2,5})\s*char/i.exec(text);
  if (c) return Math.floor(Number(c[1]) / 6);
  return undefined;
}

function question(text: string): FoundQuestion {
  const limit = limitFrom(text);
  return limit ? { text, word_limit: limit } : { text };
}

const STANDARD = /^(resume|cv|cover letter|full name|first name|last name|name|email|phone|current location|location|current company|linkedin|twitter|github|portfolio|website|other website|additional information|pronouns)\b/i;

function clean(html: string): string {
  const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
  return html
    .replace(/<span class="required">[^<]*<\/span>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => entities[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Labels from a Lever apply page. Custom question cards win; without any, every non-standard label. */
export function leverQuestions(html: string): FoundQuestion[] {
  const label = /class="application-label[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const cards = [...html.matchAll(/<li class="application-question custom-question"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  const source = cards.length ? cards.join("\n") : html;
  const texts = [...source.matchAll(label)].map((m) => clean(m[1])).filter((t) => t && !STANDARD.test(t));
  return [...new Set(texts)].map(question);
}

type GreenhouseJob = { questions?: { label: string; fields: { name: string; type: string }[] }[] };

const GH_SKIP = /^(first_name|last_name|email|phone|resume|resume_text|cover_letter|cover_letter_text|location)$/;

/** Free-text questions from the Greenhouse job board API. */
export function greenhouseQuestions(job: GreenhouseJob): FoundQuestion[] {
  return (job.questions ?? [])
    .filter((q) => q.fields.every((f) => !GH_SKIP.test(f.name)) && q.fields.some((f) => f.type === "textarea" || f.type === "input_text"))
    .map((q) => q.label.trim())
    .filter((t) => t && !STANDARD.test(t))
    .map(question);
}

const FORM_FACT = /\b(how many years|years of|ctc|salary|compensation|notice|location|relocat|join|authori[sz]ed|visa|sponsor|hear about|heard about|pronoun|gender|veteran|disabilit|start date|referr|current or most recent|linkedin|website|portfolio link|github|phone number|email address)/i;

/** Questions that need a story start ticked. Form facts (years, pay, notice) start unticked. */
export function isEssay(text: string): boolean {
  return text.length >= 25 && !FORM_FACT.test(text);
}

/** Pasted questions: one per line, numbering and bullets dropped, fragments under 10 characters skipped. */
export function textQuestions(text: string): FoundQuestion[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter((l) => l.length >= 10)
    .map(question);
}

/** Read questions from a supported board. Never throws: a failure is an empty list plus a reason. */
export async function fetchQuestions(url: string): Promise<{ questions: FoundQuestion[]; reason: "ok" | "unsupported" | "failed" | "none" }> {
  const b = boardOf(url);
  if (!b) return { questions: [], reason: "unsupported" };
  try {
    const res = await fetch(b.apply, { headers: { "User-Agent": "Mozilla/5.0 (InYourWords question reader)" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { questions: [], reason: "failed" };
    const questions = b.board === "lever" ? leverQuestions(await res.text()) : greenhouseQuestions((await res.json()) as GreenhouseJob);
    return { questions, reason: questions.length ? "ok" : "none" };
  } catch (err) {
    console.error("intake: read failed", b.board, err instanceof Error ? err.message : err);
    return { questions: [], reason: "failed" };
  }
}
