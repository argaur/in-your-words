import { judgeAnswer } from "@/lib/engine/judge";
import { fail, fromError, ok } from "@/lib/api";
import { guard, JudgeBody, LIMITS, spendToken } from "@/lib/routes";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const blocked = guard(req, json?.run_token);
  if (blocked) return blocked;
  const body = JudgeBody.safeParse(json);
  if (!body.success) return fail("bad_request", "The answer data is not valid", 400);
  try {
    const { draft, question, company, story_lines, web_lines } = body.data;
    const used = await spendToken(body.data.run_token, `judge:${question.id}`, LIMITS.judgePerAnswer);
    if (used) return used;
    return ok(await judgeAnswer({ draft: { ...draft, unanswered: draft.unanswered ?? null }, question, company, story_lines, web_lines }));
  } catch (err) {
    return fromError(err);
  }
}
