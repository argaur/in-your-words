import { fetchQuestions } from "@/lib/intake";
import { fail, ok } from "@/lib/api";
import { guard, QuestionsBody } from "@/lib/routes";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * v2: read the form questions from a Lever or Greenhouse posting. Free (no model, no Tavily),
 * so it is not capped. Only those two hosts are ever fetched (boardOf), whatever URL is sent.
 */
export async function POST(req: Request) {
  const blocked = guard(req, false);
  if (blocked) return blocked;
  const body = QuestionsBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "The posting link is not valid", 400);
  return ok(await fetchQuestions(body.data.posting_url));
}
