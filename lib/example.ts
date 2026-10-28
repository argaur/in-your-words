/**
 * F01 (SPEC 10.1, approved 2026-10-27): a judge on the demo can answer the example application's
 * flagged line twice a day, without a full live run. No run token: the server checks the line is the
 * example's own flagged line, then spends one example answer for that visitor today.
 */
import type { CapStore } from "./cap";
import type { Question, Run } from "./engine/schema";

/** Two example answers per visitor a day (a first answer can miss a fact), and at most this many across all visitors. */
export const EXAMPLE_LIMITS = { visitor: 2, global: 40 } as const;

export function exampleLineAllowed(
  body: { mode: "gap" | "recheck"; question: Question; sentence: { id: string; text: string } },
  run: Run,
): boolean {
  if (body.mode !== "gap") return false;
  const q = run.questions.find((x) => x.id === body.question.id);
  if (!q || q.text !== body.question.text) return false;
  const s = run.answers.find((a) => a.question_id === q.id)?.sentences.find((x) => x.id === body.sentence.id);
  return Boolean(s && s.status === "cut" && s.label !== "web" && s.text === body.sentence.text);
}

export async function reserveExampleLine(store: CapStore, visitor: string): Promise<"ok" | "example_used" | "capped_global"> {
  if (!(await store.bump(`ex:${visitor}`, EXAMPLE_LIMITS.visitor))) return "example_used";
  if (!(await store.bump("ex:global", EXAMPLE_LIMITS.global))) return "capped_global";
  return "ok";
}
