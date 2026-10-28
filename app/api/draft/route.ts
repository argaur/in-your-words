import { draft } from "@/lib/engine/draft";
import { fail, fromError, ok } from "@/lib/api";
import { DraftBody, guard, LIMITS, spendToken } from "@/lib/routes";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const blocked = guard(req, json?.run_token);
  if (blocked) return blocked;
  const body = DraftBody.safeParse(json);
  if (!body.success) return fail("bad_request", "The run data is not valid", 400);
  try {
    const used = await spendToken(body.data.run_token, "draft", LIMITS.draftPerToken);
    if (used) return used;
    return ok(await draft(body.data));
  } catch (err) {
    return fromError(err);
  }
}
