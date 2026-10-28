import { fail, ok } from "@/lib/api";
import { capturePosthog, cronAuthorized, fetchTavilyLeft, probeTokenFactory, runCreditCheck, runsSinceStart } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily, from vercel.json. 200 whenever the check ran; the flags say what is wrong. */
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return fail("unauthorized", "Cron only", 401);
  }
  const report = await runCreditCheck({
    probeTokenFactory,
    tavilyLeft: fetchTavilyLeft,
    runsSinceStart,
    capture: capturePosthog,
  });
  return ok(report);
}
