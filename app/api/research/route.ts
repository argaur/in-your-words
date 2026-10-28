import { checkDoNotSend } from "@/lib/engine/rules";
import { EngineError } from "@/lib/engine/llm";
import { research } from "@/lib/engine/research";
import { doNotSendList, fail, fromError, issueRunToken, ok } from "@/lib/api";
import { guard, reserve, ResearchBody } from "@/lib/routes";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const blocked = guard(req, false);
  if (blocked) return blocked;
  const body = ResearchBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "The posting link or text is not valid", 400);
  try {
    const list = doNotSendList(body.data.persona);
    // Rule 6: refuse before any outside call, then check again once the company is named.
    if (checkDoNotSend({ company: "", posting_url: body.data.posting_url }, list)) {
      return fail("do_not_send", "This company is on your do-not-send list", 409);
    }
    // The cap is taken after the free do-not-send check and before any paid call.
    // The retry token counts only with pasted text, the one way a thin posting can be retried.
    const capped = await reserve(req, body.data.posting_text ? body.data.retry_token : undefined);
    if (capped) return capped;
    const r = await research(body.data);
    if (checkDoNotSend({ company: r.company, posting_url: body.data.posting_url }, list)) {
      return fail("do_not_send", "This company is on your do-not-send list", 409);
    }
    return ok({ run_token: issueRunToken(), ...r });
  } catch (err) {
    if (err instanceof EngineError && err.code === "thin_posting") {
      return fail(err.code, err.message, 422, { retry_token: issueRunToken() });
    }
    return fromError(err);
  }
}
