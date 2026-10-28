import { z } from "zod";
import { QuestionSchema, StoryLineSchema, WebLineSchema } from "./engine/schema";
import { fail, localMode, runTokenId, sameOrigin, verifyRunToken } from "./api";
import { clientIp, hashIp, LIMITS, neonStore, reserveRunOrRetry, useToken, type CapStore } from "./cap";
import { reserveExampleLine } from "./example";

let store: CapStore | null = null;

/** Live mode fails closed: no database, no live runs. */
function capStore(): CapStore | null {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  store = neonStore(url);
  return store;
}

/**
 * Research step: take one of today's live runs. Local mode is never capped. A retry after a
 * thin posting passes the retry token from that refusal and does not take a second run.
 */
export async function reserve(req: Request, retryToken?: string): Promise<Response | null> {
  if (localMode) return null;
  const s = capStore();
  const salt = process.env.RUN_TOKEN_SECRET;
  if (!s || !salt) return fail("config", "Live runs are not set up", 500);
  const retryId = retryToken && verifyRunToken(retryToken) ? runTokenId(retryToken) : null;
  const result = await reserveRunOrRetry(s, hashIp(clientIp(req), salt), retryId);
  if (result === "ok") return null;
  return fail(result, "Today's live runs are used up", 429);
}

/** Draft and judge: each run token gets a fixed number of calls, so it cannot be replayed. */
export async function spendToken(token: string | undefined, key: string, limit: number): Promise<Response | null> {
  if (localMode) return null;
  const s = capStore();
  if (!s || !token) return fail("config", "Live runs are not set up", 500);
  if (await useToken(s, `tok:${runTokenId(token)}:${key}`, limit)) return null;
  return fail("token_used", "This run has used its calls. Start again", 429);
}

export { LIMITS };

/** Screenshot reads: a small daily allowance per visitor, separate from live runs. */
export async function reserveImage(req: Request): Promise<Response | null> {
  if (localMode) return null;
  const s = capStore();
  const salt = process.env.RUN_TOKEN_SECRET;
  if (!s || !salt) return fail("config", "Live runs are not set up", 500);
  if (await s.bump(`img:${hashIp(clientIp(req), salt)}`, LIMITS.imagePerVisitor)) return null;
  return fail("capped_visitor", "Today's screenshot reads are used up", 429);
}

/** F01: one gap answer on the example application per visitor a day, no run token. */
export async function reserveExample(req: Request): Promise<Response | null> {
  if (localMode) return null;
  const s = capStore();
  const salt = process.env.RUN_TOKEN_SECRET;
  if (!s || !salt) return fail("config", "Live runs are not set up", 500);
  const result = await reserveExampleLine(s, hashIp(clientIp(req), salt));
  if (result === "ok") return null;
  return fail(result, "The example answer for today is used", 429);
}

/** Live runs stay off until the Slice 4 cap ships. Local mode always runs. */
export function guard(req: Request, needsToken: unknown | false): Response | null {
  if (!localMode && process.env.LIVE_RUNS_ENABLED !== "1") return fail("live_off", "Live runs are not open yet", 403);
  if (!sameOrigin(req)) return fail("bad_origin", "Requests must come from this site", 403);
  if (needsToken !== false && !localMode && !verifyRunToken(needsToken)) return fail("bad_token", "This run has expired. Start again", 401);
  return null;
}

export const ResearchBody = z.object({
  posting_url: z.string().url().max(2000),
  posting_text: z.string().max(40_000).optional(),
  persona: z.boolean(),
  retry_token: z.string().max(200).optional(),
});

export const DraftBody = z.object({
  run_token: z.string().optional(),
  company: z.string().min(1).max(200),
  story_lines: z.array(StoryLineSchema).min(1).max(600),
  web_lines: z.array(WebLineSchema).max(200),
  questions: z.array(QuestionSchema).min(1).max(7),
});

export const LineBody = z.object({
  run_token: z.string().optional(),
  /** F01: a gap answer on the demo's example application, checked against the saved run. */
  example: z.boolean().optional(),
  mode: z.enum(["gap", "recheck"]),
  company: z.string().min(1).max(200),
  question: QuestionSchema,
  sentence: z.object({ id: z.string().max(40), text: z.string().min(1).max(2000), ask: z.string().max(400).optional() }),
  answer: z.string().max(8000).optional(),
  others: z.array(z.string().max(2000)).max(60),
  story_lines: z.array(StoryLineSchema).min(1).max(600),
  web_lines: z.array(WebLineSchema).max(200),
});

export const QuestionsBody = z.object({ posting_url: z.string().url().max(2000) });

// About 4 MB of base64. Vercel refuses bodies over 4.5 MB; the browser shrinks screenshots first.
export const ImageBody = z.object({ image: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(4_000_000) });

export const JudgeBody = z.object({
  run_token: z.string().optional(),
  company: z.string().min(1).max(200),
  question: QuestionSchema,
  draft: z.object({
    question_id: z.string(),
    unanswered: z.object({ topic: z.string() }).nullable().optional(),
    sentences: z
      .array(z.object({ text: z.string().max(2000), label: z.enum(["spoken", "web", "inference"]), source_ids: z.array(z.string()).default([]), quote: z.string().optional() }))
      .max(60),
  }),
  story_lines: z.array(StoryLineSchema).min(1).max(600),
  web_lines: z.array(WebLineSchema).max(200),
});
