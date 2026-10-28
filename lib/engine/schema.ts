/**
 * The one contract (IMPLEMENTATION_PLAN.md section 3). Route responses, the replay file,
 * the local run log and the UI all parse through these schemas. Change a shape here only.
 */
import { z } from "zod";

export const LabelSchema = z.enum(["spoken", "web", "inference"]);
export type Label = z.infer<typeof LabelSchema>;

export const SentenceStatusSchema = z.enum(["kept", "cut", "restored"]);
export type SentenceStatus = z.infer<typeof SentenceStatusSchema>;

export const StoryLineSchema = z.object({
  id: z.string().regex(/^S\d+$/),
  text: z.string(),
  item: z.number().int().optional(),
});
export type StoryLine = z.infer<typeof StoryLineSchema>;

export const WebLineSchema = z.object({
  id: z.string().regex(/^W\d+$/),
  text: z.string(),
  url: z.string().url(),
});
export type WebLine = z.infer<typeof WebLineSchema>;

export const QuestionSchema = z.object({
  id: z.string().regex(/^Q\d+$/),
  text: z.string().min(1),
  word_limit: z.number().int().positive().optional(),
  kind: z.enum(["essay", "outreach_short", "outreach_long"]),
});
export type Question = z.infer<typeof QuestionSchema>;

export const NumberCheckSchema = z.object({
  numbers: z.array(z.string()),
  passed: z.boolean(),
  missing: z.array(z.string()),
});

export const SentenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  label: LabelSchema,
  source_ids: z.array(z.string()),
  quote: z.string().optional(),
  status: SentenceStatusSchema,
  cut_reason: z.string().optional(),
  /** v2: the one question asked back under a flagged line, answered by voice. */
  ask: z.string().optional(),
  /** v2: the user changed the words; the line stays "not checked" until a recheck. */
  edited: z.boolean().optional(),
  number_check: NumberCheckSchema,
  generic: z.boolean(),
  verdict: z.enum(["none", "true", "false"]),
  marked_blind: z.boolean(),
});
export type Sentence = z.infer<typeof SentenceSchema>;

export const AnswerSchema = z.object({
  question_id: z.string(),
  sentences: z.array(SentenceSchema),
  unanswered: z.object({ topic: z.string() }).nullable(),
  char_count: z.number().int(),
  word_count: z.number().int(),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const StepStatusSchema = z.enum(["waiting", "running", "done", "failed"]);

export const UsageSchema = z.object({
  tokens: z.number().int(),
  seconds: z.number(),
  cost_estimate: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const RunSchema = z.object({
  run_id: z.string(),
  mode: z.enum(["replay", "live", "local", "baseline"]),
  persona: z.boolean(),
  bank_source: z.enum(["persona", "pasted", "file"]),
  posting_url: z.string(),
  company: z.string(),
  steps: z.object({ research: StepStatusSchema, draft: StepStatusSchema, judge: StepStatusSchema }),
  fallback_model: z.boolean(),
  usage: z.object({ research: UsageSchema, draft: UsageSchema, judge: UsageSchema }),
  timer_active_seconds: z.number().int(),
  story_lines: z.array(StoryLineSchema),
  web_lines: z.array(WebLineSchema),
  questions: z.array(QuestionSchema),
  answers: z.array(AnswerSchema),
});
export type Run = z.infer<typeof RunSchema>;

/** An optional text field in model output. Nemotron sends null for "nothing to say"; read it as absent. */
const modelText = z.string().nullable().transform((v) => v ?? undefined).optional();

/** What the drafter must return. Parsed with zod, one retry on failure (rule 4). */
export const DraftOutputSchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.string(),
      unanswered: z.object({ topic: z.string() }).nullable().optional(),
      sentences: z.array(
        z.object({
          text: z.string(),
          label: LabelSchema,
          source_ids: z.array(z.string()).default([]),
          quote: modelText,
        }),
      ),
    }),
  ),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export const JudgeOutputSchema = z.object({
  verdict: z.enum(["supported", "unsupported"]),
  reason: z.string(),
  ask: modelText,
});

/** One line from /api/line: a gap answer folded in, or the user's edit, labelled and cited. */
export const LineOutputSchema = z.object({
  text: z.string().min(1),
  label: LabelSchema,
  source_ids: z.array(z.string()).default([]),
  quote: modelText,
});

/** Questions read from a screenshot or pasted text. */
export const FoundQuestionsSchema = z.object({
  questions: z.array(z.object({ text: z.string().min(1), word_limit: z.number().int().positive().nullable().optional() })),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

/** retry_token comes only with thin_posting: the pasted-text retry spends it instead of a run. */
export type ApiError = { code: string; message: string; retry_token?: string };
export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };
