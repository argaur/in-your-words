import type { NumberCheck } from "./numbers";
import { extractNumbers } from "./numbers";
import type { Label, SentenceStatus } from "./schema";

/** The judge sees each cited line plus 3 lines either side: speech spreads one fact over nearby lines. */
export function windowIds(ids: string[], known: Set<string>): string[] {
  const near = new Set<string>();
  for (const id of ids) {
    if (!known.has(id)) continue;
    const prefix = id[0];
    const n = Number(id.slice(1));
    for (let k = n - 3; k <= n + 3; k++) {
      const candidate = `${prefix}${k}`;
      if (known.has(candidate)) near.add(candidate);
    }
  }
  return [...near].sort((a, b) => (a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a < b ? -1 : 1));
}

function properNouns(text: string): string[] {
  return text
    .split(/\s+/)
    .slice(1)
    .map((w) => w.replace(/[^A-Za-z0-9-]/g, ""))
    .filter((w) => w.length >= 3 && /^[A-Z]/.test(w));
}

/**
 * A name said once (her employer, a product) sits outside the 3-line window of later lines.
 * For each proper noun the window lacks, add the first story line that names it.
 */
export function nameLines(sentence: string, story: { id: string; text: string }[], window: string[]): string[] {
  const seen = story.filter((l) => window.includes(l.id)).map((l) => l.text).join(" ");
  const out = new Set<string>();
  for (const name of properNouns(sentence)) {
    if (seen.includes(name)) continue;
    const hit = story.find((l) => l.text.includes(name));
    if (hit && !window.includes(hit.id)) out.add(hit.id);
  }
  return [...out];
}

type KeepInput = {
  label: Label;
  source_ids: string[];
  judge: "supported" | "unsupported";
  judgeReason: string;
  numberCheck: NumberCheck;
  aiWords?: string[];
};

export type KeepResult = { status: "kept"; cut_reason?: undefined } | { status: "cut"; cut_reason: string };

/** Rules 2 and 3 plus the judge. Code checks run first and the model never overrules them. */
export function decideKeep(input: KeepInput): KeepResult {
  const { label, source_ids, judge, judgeReason, numberCheck } = input;
  if (label === "spoken" && !source_ids.some((id) => id.startsWith("S"))) {
    return { status: "cut", cut_reason: "No line from your stories is cited" };
  }
  if (label === "web" && !source_ids.some((id) => id.startsWith("W"))) {
    return { status: "cut", cut_reason: "No web source is cited" };
  }
  if (!numberCheck.passed) {
    const missing = numberCheck.missing.join(", ");
    if (label === "inference") return { status: "cut", cut_reason: `A linking line cannot add a number: ${missing}` };
    const where = label === "spoken" ? "your stories" : "the web sources";
    return { status: "cut", cut_reason: `Number not in ${where}: ${missing}` };
  }
  if (judge === "unsupported") return { status: "cut", cut_reason: judgeReason };
  if (input.aiWords?.length) return { status: "cut", cut_reason: `Not how you said it: ${input.aiWords.join(", ")}` };
  return { status: "kept" };
}

/** Feature 10: an inference line with no number and no name taken from the evidence. */
export function flagGeneric(sentence: { label: Label; text: string }, evidence: string[]): boolean {
  if (sentence.label !== "inference") return false;
  if (extractNumbers(sentence.text).length > 0) return false;
  const pool = evidence.join(" ");
  const names = sentence.text
    .split(/\s+/)
    .slice(1)
    .map((w) => w.replace(/[^A-Za-z0-9-]/g, ""))
    .filter((w) => w.length >= 3 && /^[A-Z]/.test(w));
  return !names.some((w) => pool.includes(w));
}

/** Rule 14: an answer with more than half its lines cut shows "Not in your stories" instead. */
export function isUnanswered(statuses: SentenceStatus[]): boolean {
  if (statuses.length === 0) return true;
  const cut = statuses.filter((s) => s !== "kept").length;
  return cut > statuses.length / 2;
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Rule 6: refuse before any outside call. */
export function checkDoNotSend(target: { company: string; posting_url: string }, list: string[]): boolean {
  let host = "";
  try {
    host = squash(new URL(target.posting_url).hostname);
  } catch {
    host = "";
  }
  const company = squash(target.company);
  return list.some((entry) => {
    const e = squash(entry);
    if (!e) return false;
    return company === e || (host !== "" && host.includes(e));
  });
}
