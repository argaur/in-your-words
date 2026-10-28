import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EngineError } from "./engine/llm";
import type { ApiError } from "./engine/schema";

export const localMode = process.env.LOCAL_RUN_LOG === "1";

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null }, { status });
}

export function fail(code: string, message: string, status: number, extra: Pick<ApiError, "retry_token"> = {}): Response {
  const error: ApiError = { code, message, ...extra };
  return Response.json({ data: null, error }, { status });
}

/** Map engine errors to fixed codes. User text never goes into an error message. */
export function fromError(err: unknown): Response {
  if (err instanceof EngineError) {
    const status = err.code === "thin_posting" ? 422 : err.code === "config" ? 500 : 502;
    return fail(err.code, err.message, status);
  }
  console.error("route error", err instanceof Error ? err.message : err);
  return fail("internal", "Something went wrong on our side", 500);
}

/** Same-origin check. Browsers send Origin on POST; scripts without it are refused on Vercel. */
export function sameOrigin(req: Request): boolean {
  if (localMode) return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return new URL(origin).host === new URL(req.url).host;
}

// Run token: HMAC-signed. v2 raised the expiry from 15 to 60 minutes: gap answers and
// rechecks in the answer studio reuse the run's token long after the draft.
const TOKEN_TTL_MS = 60 * 60 * 1000;

function secret(): string {
  const s = process.env.RUN_TOKEN_SECRET;
  if (!s) {
    if (localMode) return "local-only-secret";
    throw new EngineError("config", "RUN_TOKEN_SECRET is not set");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueRunToken(): string {
  const payload = `${Date.now() + TOKEN_TTL_MS}.${crypto.randomUUID()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyRunToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(payload.split(".")[0]) > Date.now();
}

/** The random middle part of a verified token: the key for its per-token call limits. */
export function runTokenId(token: string): string {
  return token.split(".")[1] ?? "";
}

/** Rule 6 list: the real user's local file when it exists, else the persona's example. */
export function doNotSendList(persona: boolean): string[] {
  const file = persona || !localMode ? "samples/meera/do-not-send.json" : "config/do-not-send.local.json";
  try {
    const parsed = JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8")) as { companies?: string[] };
    return parsed.companies ?? [];
  } catch {
    if (file.startsWith("config/")) throw new EngineError("config", "config/do-not-send.local.json is missing or unreadable");
    return [];
  }
}
