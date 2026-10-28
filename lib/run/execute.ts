/**
 * v2: one application run in the browser (research, draft, judge), built into a Run. The v1
 * /run flow keeps its own copy with per-step retry state; this one restarts from the top.
 */
import { RunSchema, type Question, type Run, type StoryLine } from "../engine/schema";
import { track } from "../analytics";
import * as api from "./client";

export type RunFailure = { step: 1 | 2 | 3; code: string; message: string; retry_token?: string };

export async function runApplication(input: {
  posting_url: string;
  posting_text?: string;
  retry_token?: string;
  questions: Question[];
  lines: StoryLine[];
  persona: boolean;
  local: boolean;
  onStep: (step: 0 | 1 | 2, state: "running" | "done" | "failed") => void;
}): Promise<{ run: Run; run_token: string } | { failure: RunFailure }> {
  const { onStep, questions, lines } = input;
  track("run_started", { mode: input.local ? "local" : "live", questions: questions.length });

  onStep(0, "running");
  const t0 = Date.now();
  const rs = await api.research({
    posting_url: input.posting_url,
    persona: input.persona,
    ...(input.posting_text ? { posting_text: input.posting_text } : {}),
    ...(input.retry_token ? { retry_token: input.retry_token } : {}),
  });
  if (rs.error) {
    onStep(0, "failed");
    return { failure: { step: 1, ...rs.error } };
  }
  onStep(0, "done");
  track("research_completed", { web_items: rs.data.web_lines.length, seconds: Math.round((Date.now() - t0) / 1000) });

  onStep(1, "running");
  const dr = await api.draft({ run_token: rs.data.run_token, company: rs.data.company, story_lines: lines, web_lines: rs.data.web_lines, questions });
  if (dr.error) {
    onStep(1, "failed");
    return { failure: { step: 2, ...dr.error } };
  }
  onStep(1, "done");

  onStep(2, "running");
  const t3 = Date.now();
  const judged = new Map<string, api.JudgeData>();
  const j = await api.judgeAll(
    { run_token: rs.data.run_token, company: rs.data.company, story_lines: lines, web_lines: rs.data.web_lines, questions, drafts: dr.data.drafts },
    judged,
  );
  if (j.error) {
    onStep(2, "failed");
    return { failure: { step: 3, ...j.error } };
  }
  onStep(2, "done");

  const results = questions.map((q) => judged.get(q.id) as api.JudgeData);
  const judgeUsage = results.reduce(
    (u, x) => ({ tokens: u.tokens + x.usage.tokens, seconds: u.seconds + x.usage.seconds, cost_estimate: u.cost_estimate + x.usage.cost_estimate }),
    { tokens: 0, seconds: 0, cost_estimate: 0 },
  );
  const run = RunSchema.parse({
    run_id: `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`,
    mode: input.local ? "local" : "live",
    persona: input.persona,
    bank_source: input.persona ? "persona" : "file",
    posting_url: input.posting_url,
    company: rs.data.company,
    steps: { research: "done", draft: "done", judge: "done" },
    fallback_model: dr.data.fallback_model,
    usage: { research: rs.data.usage, draft: dr.data.usage, judge: judgeUsage },
    timer_active_seconds: 0,
    story_lines: lines,
    web_lines: rs.data.web_lines,
    questions,
    answers: results.map((x) => x.answer),
  });
  const all = run.answers.flatMap((a) => a.sentences);
  track("draft_completed", {
    sentences: all.length,
    kept: all.filter((s) => s.status === "kept").length,
    cut: all.filter((s) => s.status === "cut").length,
    spoken: all.filter((s) => s.label === "spoken").length,
    web: all.filter((s) => s.label === "web").length,
    inference: all.filter((s) => s.label === "inference").length,
    generic: all.filter((s) => s.generic).length,
    seconds: Math.round((Date.now() - t3) / 1000),
    retries: dr.data.retries,
    unanswered: run.answers.filter((a) => a.unanswered).length,
    fallback_model: run.fallback_model,
  });
  return { run, run_token: rs.data.run_token };
}
