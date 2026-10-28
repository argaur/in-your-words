/**
 * Browser side of the three calls (PRD rule 9). The server keeps no run state, so every
 * call carries what it needs. Each step's result is kept, so a retry reruns only that step.
 */
import type { Answer, ApiResult, DraftOutput, Question, StoryLine, Usage, WebLine } from "../engine/schema";

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { data: null, error: { code: "network", message: "The request did not reach the server" } };
  }
}

export type ResearchData = { run_token: string; company: string; posting_text: string; extract_words: number; web_lines: WebLine[]; usage: Usage };
export type DraftData = { drafts: DraftOutput["answers"]; fallback_model: boolean; usage: Usage; retries: number };
export type JudgeData = { answer: Answer; usage: Usage };

export function research(body: { posting_url: string; posting_text?: string; persona: boolean; retry_token?: string }) {
  return postJson<ResearchData>("/api/research", body);
}

export function draft(body: { run_token: string; company: string; story_lines: StoryLine[]; web_lines: WebLine[]; questions: Question[] }) {
  return postJson<DraftData>("/api/draft", body);
}

const JUDGE_AT_ONCE = 2; // each judge call already runs 4 sentences at once (plan section 2)

/** Judge every answer, two at a time. The first error stops the step; answers already judged are kept. */
export async function judgeAll(
  input: { run_token: string; company: string; story_lines: StoryLine[]; web_lines: WebLine[]; questions: Question[]; drafts: DraftOutput["answers"] },
  done: Map<string, JudgeData>,
): Promise<{ error: { code: string; message: string } | null }> {
  const todo = input.questions.filter((q) => !done.has(q.id));
  let failed: { code: string; message: string } | null = null;
  let next = 0;
  const worker = async () => {
    while (next < todo.length && !failed) {
      const q = todo[next++];
      const d = input.drafts.find((a) => a.question_id === q.id) ?? { question_id: q.id, sentences: [], unanswered: null };
      const r = await postJson<JudgeData>("/api/judge", {
        run_token: input.run_token,
        company: input.company,
        question: q,
        draft: d,
        story_lines: input.story_lines,
        web_lines: input.web_lines,
      });
      if (r.error) failed = r.error;
      else done.set(q.id, r.data);
    }
  };
  await Promise.all(Array.from({ length: Math.min(JUDGE_AT_ONCE, todo.length) }, worker));
  return { error: failed };
}

export type FoundQuestion = { text: string; word_limit?: number };

export function readQuestions(posting_url: string) {
  return postJson<{ questions: FoundQuestion[]; reason: "ok" | "unsupported" | "failed" | "none" }>("/api/questions", { posting_url });
}

export function readImageQuestions(image: string) {
  return postJson<{ questions: FoundQuestion[]; usage: Usage }>("/api/questions/image", { image });
}

export function fixLine(body: {
  run_token?: string;
  example?: boolean;
  mode: "gap" | "recheck";
  company: string;
  question: Question;
  sentence: { id: string; text: string; ask?: string };
  answer?: string;
  others: string[];
  story_lines: StoryLine[];
  web_lines: WebLine[];
}) {
  return postJson<{ sentence: Answer["sentences"][number]; usage: Usage }>("/api/line", body);
}

export function saveLocalRun(run: unknown) {
  return postJson<{ path: string }>("/api/runs/local", { run });
}
