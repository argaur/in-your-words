import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RunSchema } from "@/lib/engine/schema";
import { fail, localMode, ok } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ run: RunSchema });

/** The only writer of runs/local/. Exists only when LOCAL_RUN_LOG=1, so never on Vercel. */
export async function POST(req: Request) {
  if (!localMode) return fail("not_found", "Not found", 404);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "The run data is not valid", 400);
  const { run } = body.data;
  if (!/^[\w-]{1,64}$/.test(run.run_id)) return fail("bad_request", "The run id is not valid", 400);
  const dir = path.join(process.cwd(), "runs", "local");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${run.run_id}.json`);
  writeFileSync(file, JSON.stringify(run, null, 2));
  return ok({ path: `runs/local/${run.run_id}.json` });
}
