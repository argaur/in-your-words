import { fixLine } from "@/lib/engine/line";
import { RunSchema } from "@/lib/engine/schema";
import { fail, fromError, ok } from "@/lib/api";
import { exampleLineAllowed } from "@/lib/example";
import { guard, LIMITS, LineBody, reserveExample, spendToken } from "@/lib/routes";
import saved from "@/samples/meera/run.json";

export const runtime = "nodejs";
export const maxDuration = 120;

const example = RunSchema.parse(saved);

/** v2 answer studio: fold a voice gap answer into one line, or recheck a line the user edited. */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  // F01: the example application has no run token. Its one gap answer is checked and capped below.
  const blocked = guard(req, json?.example === true ? false : json?.run_token);
  if (blocked) return blocked;
  const body = LineBody.safeParse(json);
  if (!body.success) return fail("bad_request", "The line data is not valid", 400);
  try {
    if (body.data.example) {
      if (!exampleLineAllowed(body.data, example)) return fail("bad_request", "Only the example's flagged line can be answered", 400);
      const capped = await reserveExample(req);
      if (capped) return capped;
    } else {
      const used = await spendToken(body.data.run_token, "line", LIMITS.linePerToken);
      if (used) return used;
    }
    return ok(await fixLine(body.data));
  } catch (err) {
    return fromError(err);
  }
}
