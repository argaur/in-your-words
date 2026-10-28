import { askJson, Meter, MODELS } from "./llm";
import { checkNumbers } from "./numbers";
import { JUDGE_SYSTEM, judgeUser } from "./prompts";
import { decideKeep, flagGeneric, isUnanswered, nameLines, windowIds } from "./rules";
import { aiWords, askFor } from "./voice";
import {
  JudgeOutputSchema,
  type Answer,
  type DraftOutput,
  type Question,
  type Sentence,
  type StoryLine,
  type WebLine,
} from "./schema";

const CONCURRENCY = Number(process.env.JUDGE_CONCURRENCY ?? 4);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%+ ]/g, " ").replace(/\s+/g, " ").trim();
}

/** If the quote sits in an uncited line of the right kind, cite that line too (from the spike). */
export function repairCitations(
  item: { label: string; source_ids: string[]; quote?: string },
  evidence: Map<string, string>,
): string[] {
  const ids = item.source_ids.filter((id) => evidence.has(id));
  const q = norm(item.quote ?? "");
  if (!q || item.label === "inference") return ids;
  if (norm(ids.map((id) => evidence.get(id)).join(" ")).includes(q)) return ids;
  const prefix = item.label === "spoken" ? "S" : "W";
  const found = [...evidence.entries()].filter(([k, v]) => k.startsWith(prefix) && norm(v).includes(q)).map(([k]) => k);
  return [...new Set([...ids, ...found])];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export type JudgeResult = { answer: Answer; usage: ReturnType<Meter["usage"]> };

type DraftItem = DraftOutput["answers"][number]["sentences"][number];

/**
 * One sentence: code checks first, then the model judges lines that pass them. A flagged line
 * carries one question back (v2: ask, don't cut). `others` is the rest of the answer, the
 * evidence for an inference line.
 */
export async function judgeSentence(input: {
  id: string;
  item: DraftItem;
  others: string[];
  question: Question;
  company: string;
  story_lines: StoryLine[];
  web_lines: WebLine[];
  meter: Meter;
}): Promise<Sentence> {
  const { item } = input;
  const evidence = new Map<string, string>([
    ...input.story_lines.map((l) => [l.id, l.text] as const),
    ...input.web_lines.map((l) => [l.id, l.text] as const),
  ]);
  const source_ids = repairCitations(item, evidence);
  const windowed = windowIds(source_ids, new Set(evidence.keys()));
  const cited = source_ids.map((id) => evidence.get(id) as string);
  const numberCheck = item.label === "inference" ? checkNumbers(item.text, []) : checkNumbers(item.text, windowed.map((id) => evidence.get(id) as string));
  const ai = item.label === "web" ? [] : aiWords(item.text, input.story_lines.map((l) => l.text).join(" "));
  const codeOnly = decideKeep({ label: item.label, source_ids, judge: "supported", judgeReason: "", numberCheck, aiWords: ai });

  let result = codeOnly;
  let judgeAsk: string | undefined;
  if (codeOnly.status === "kept") {
    const ev =
      item.label === "inference"
        ? `Rest of the answer:\n${input.others.join("\n")}`
        : [...windowed, ...nameLines(item.text, input.story_lines, windowed)].map((id) => `${id}: ${evidence.get(id)}`).join("\n");
    const j = await askJson(JudgeOutputSchema, MODELS.judge, JUDGE_SYSTEM, judgeUser(input.question, input.company, item.label, item.text, ev), input.meter, 2000);
    result = decideKeep({ label: item.label, source_ids, judge: j.verdict, judgeReason: j.reason, numberCheck, aiWords: ai });
    judgeAsk = j.verdict === "unsupported" ? j.ask : undefined;
  }

  const cut_reason = result.status === "cut" ? result.cut_reason : undefined;
  return {
    id: input.id,
    text: item.text,
    label: item.label,
    source_ids,
    quote: item.quote,
    status: result.status,
    cut_reason,
    ask: result.status === "cut" ? askFor({ label: item.label, cut_reason }, numberCheck, judgeAsk) : undefined,
    number_check: numberCheck,
    generic: flagGeneric(item, cited.length ? cited : [...evidence.values()]),
    verdict: "none",
    marked_blind: false,
  };
}

/** Step 3, one answer per call (plan section 3). */
export async function judgeAnswer(input: {
  draft: DraftOutput["answers"][number];
  question: Question;
  company: string;
  story_lines: StoryLine[];
  web_lines: WebLine[];
}): Promise<JudgeResult> {
  const meter = new Meter();
  const all = input.draft.sentences;

  const sentences: Sentence[] = await mapLimit(all, CONCURRENCY, (item, i) =>
    judgeSentence({
      id: `${input.draft.question_id}-${i + 1}`,
      item,
      others: all.filter((_, k) => k !== i).map((s) => s.text),
      question: input.question,
      company: input.company,
      story_lines: input.story_lines,
      web_lines: input.web_lines,
      meter,
    }),
  );

  const drafterGap = input.draft.unanswered ?? null;
  const gap = drafterGap ?? (isUnanswered(sentences.map((s) => s.status)) ? { topic: input.question.text.slice(0, 80) } : null);
  const keptText = sentences.filter((s) => s.status === "kept").map((s) => s.text).join(" ");

  return {
    answer: {
      question_id: input.draft.question_id,
      sentences,
      unanswered: gap,
      char_count: keptText.length,
      word_count: keptText.split(/\s+/).filter(Boolean).length,
    },
    usage: meter.usage(),
  };
}
