import { askJson, EngineError, Meter, MODELS } from "./llm";
import { DRAFT_SYSTEM, draftUser } from "./prompts";
import { DraftOutputSchema, type DraftOutput, type Question, type StoryLine, type WebLine } from "./schema";

export type DraftResult = {
  drafts: DraftOutput["answers"];
  fallback_model: boolean;
  usage: ReturnType<Meter["usage"]>;
  retries: number;
};

/** Step 2: Ultra drafts. If Ultra fails twice, Super drafts and the run is marked fallback (rule 15). */
export async function draft(input: {
  company: string;
  story_lines: StoryLine[];
  web_lines: WebLine[];
  questions: Question[];
}): Promise<DraftResult> {
  const meter = new Meter();
  const user = draftUser(input.company, input.story_lines, input.web_lines, input.questions);
  let fallback = false;
  let out: DraftOutput;
  try {
    out = await askJson(DraftOutputSchema, MODELS.draft, DRAFT_SYSTEM, user, meter, 8_000, { thinking: false });
  } catch (err) {
    if (err instanceof EngineError && err.code === "config") throw err;
    console.error("draft: primary model failed, using fallback", err instanceof Error ? err.message : err);
    fallback = true;
    out = await askJson(DraftOutputSchema, MODELS.judge, DRAFT_SYSTEM, user, meter, 8_000, { thinking: false });
  }
  const known = new Set(input.questions.map((q) => q.id));
  return {
    drafts: out.answers.filter((a) => known.has(a.question_id)),
    fallback_model: fallback,
    usage: meter.usage(),
    retries: meter.retries,
  };
}
