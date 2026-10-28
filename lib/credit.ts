/**
 * Daily credit check (plan C6, open decisions 4 and 5). Tavily reports its balance at /usage.
 * Token Factory has no balance endpoint (probed 2026-10-26, all 404), so it gets a 1-token
 * call to prove the key and credit still work, plus an estimate from the live run count.
 * The alert is a PostHog alert on credit_check_ran: a failed flag, or no event in a day.
 */
import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { MODELS, TOKEN_FACTORY_URL } from "./engine/llm";
import { POSTHOG_HOST, POSTHOG_KEY, POSTHOG_PROJECT } from "./posthog-keys";

export const CREDIT = {
  startUsd: 30, // Token Factory balance Gaurav read in the console, 2026-10-26
  startDay: "2026-10-26",
  costPerRunUsd: 0.03, // measured $0.016 to $0.023 per package (COSTS.md), rounded up
  tfFloorUsd: 3, // about a week of the full 20-run daily cap
  tavilyFloor: 50, // about 25 live runs at 2 credits each
} as const;

export type CreditReport = {
  token_factory_ok: boolean;
  tavily_ok: boolean;
  tf_est_left_usd: number | null;
  tavily_left: number | null;
  runs_since_start: number | null;
};

export function assessCredit(input: { tfProbeOk: boolean; runs: number | null; tavilyLeft: number | null }): CreditReport {
  const est = input.runs === null ? null : Math.round((CREDIT.startUsd - input.runs * CREDIT.costPerRunUsd) * 100) / 100;
  return {
    token_factory_ok: input.tfProbeOk && (est === null || est >= CREDIT.tfFloorUsd),
    tavily_ok: input.tavilyLeft !== null && input.tavilyLeft >= CREDIT.tavilyFloor,
    tf_est_left_usd: est,
    tavily_left: input.tavilyLeft,
    runs_since_start: input.runs,
  };
}

/** Credits left on the account plan, from the Tavily /usage reply. */
export function tavilyLeft(body: unknown): number | null {
  const account = (body as { account?: { plan_usage?: unknown; plan_limit?: unknown } } | null)?.account;
  if (typeof account?.plan_usage !== "number" || typeof account?.plan_limit !== "number") return null;
  return account.plan_limit - account.plan_usage;
}

/** Vercel cron sends Authorization: Bearer $CRON_SECRET. No secret set means nobody gets in. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CreditDeps = {
  probeTokenFactory(): Promise<boolean>;
  tavilyLeft(): Promise<number | null>;
  runsSinceStart(): Promise<number>;
  capture(event: "credit_check_ran", props: Record<string, string | number | boolean | null>): Promise<void>;
};

async function settle<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`credit check: ${name} failed`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function runCreditCheck(deps: CreditDeps): Promise<CreditReport & { capture_ok: boolean }> {
  const [tfProbeOk, left, runs] = await Promise.all([
    settle("token factory probe", deps.probeTokenFactory, false),
    settle("tavily usage", deps.tavilyLeft, null),
    settle<number | null>("run count", deps.runsSinceStart, null),
  ]);
  const report = assessCredit({ tfProbeOk, runs, tavilyLeft: left });
  const all_ok = report.token_factory_ok && report.tavily_ok && report.runs_since_start !== null;
  const capture_ok = await settle(
    "posthog capture",
    async () => {
      await deps.capture("credit_check_ran", { ...report, all_ok });
      return true;
    },
    false,
  );
  return { ...report, capture_ok };
}

// Real dependencies, wired in the cron route.

export async function probeTokenFactory(): Promise<boolean> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set");
  const res = await fetch(`${TOKEN_FACTORY_URL}chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELS.judge,
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) console.error("credit check: token factory probe status", res.status);
  return res.ok;
}

export async function fetchTavilyLeft(): Promise<number | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetch("https://api.tavily.com/usage", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`tavily usage status ${res.status}`);
  return tavilyLeft(await res.json());
}

/**
 * live_counter keeps only today and yesterday, so each day the cron copies the finished
 * 'global' counts into credit_ledger. A cron missed for 2 days loses one day of runs.
 */
export async function runsSinceStart(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  await sql`CREATE TABLE IF NOT EXISTS credit_ledger (day date PRIMARY KEY, runs integer NOT NULL)`;
  await sql`INSERT INTO credit_ledger (day, runs)
    SELECT day, count FROM live_counter WHERE ip_hash = 'global' AND day < current_date
    ON CONFLICT (day) DO UPDATE SET runs = EXCLUDED.runs`;
  const rows = await sql`SELECT
    (SELECT COALESCE(SUM(runs), 0) FROM credit_ledger WHERE day >= ${CREDIT.startDay}::date)
    + (SELECT COALESCE(MAX(count), 0) FROM live_counter WHERE day = current_date AND ip_hash = 'global') AS runs`;
  return Number(rows[0].runs);
}

export async function capturePosthog(event: string, props: Record<string, string | number | boolean | null>): Promise<void> {
  const res = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      distinct_id: "cron-credit-check",
      properties: { ...props, project: POSTHOG_PROJECT, $process_person_profile: false },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`posthog capture status ${res.status}`);
}
