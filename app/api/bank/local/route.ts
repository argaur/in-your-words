import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { fail, localMode, ok } from "@/lib/api";

export const runtime = "nodejs";

/** Gaurav's own bank file, read from disk on his machine only. 404 unless LOCAL_RUN_LOG=1. */
export async function GET() {
  if (!localMode) return fail("not_found", "Not found", 404);
  const dir = path.join(process.cwd(), "stories");
  const bank = path.join(dir, "bank.md");
  if (!existsSync(bank)) return fail("no_bank", "stories/bank.md is not there yet", 404);
  const glossaryFile = path.join(dir, "glossary.json");
  const glossary = existsSync(glossaryFile) ? (JSON.parse(readFileSync(glossaryFile, "utf8")) as Record<string, string>) : {};
  return ok({ raw: readFileSync(bank, "utf8"), glossary });
}

const Spoken = z.object({ text: z.string().min(1).max(8000), source: z.enum(["interview", "gap", "memo"]), prompt: z.string().max(400).optional() });

/**
 * v2: a voice answer from the app, appended to Gaurav's own bank as a plain line, so the next
 * run (and the CLI) sees it. Local only. Each answer is one line, prefixed with where it came from.
 */
export async function POST(req: Request) {
  if (!localMode) return fail("not_found", "Not found", 404);
  const body = Spoken.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "The answer is not valid", 400);
  const bank = path.join(process.cwd(), "stories", "bank.md");
  if (!existsSync(bank)) return fail("no_bank", "stories/bank.md is not there yet", 404);
  const raw = readFileSync(bank, "utf8");
  const header = "# Added in the app (v2)";
  const day = new Date().toISOString().slice(0, 10);
  const asked = body.data.prompt ? ` Asked: ${body.data.prompt.replace(/\s+/g, " ")}` : "";
  const line = `${body.data.text.replace(/\s+/g, " ").trim()} [${body.data.source}, ${day}.${asked}]`;
  appendFileSync(bank, `${raw.includes(header) ? "" : `\n===\n${header}\n\n`}${line}\n`, "utf8");
  return ok({ appended: true });
}
