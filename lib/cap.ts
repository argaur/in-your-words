/**
 * Live cap (plan section 4). One Neon table, live_counter, keyed by (day, key). Keys:
 * 'global', a salted visitor hash, and 'tok:<id>:draft' or 'tok:<id>:judge:<Q>' so one run
 * token cannot be replayed to keep calling the engine. Each bump is one atomic upsert.
 */
import { createHmac } from "node:crypto";
import { neon } from "@neondatabase/serverless";

// v2: linePerToken covers gap answers and rechecks in one studio session. imagePerVisitor caps
// screenshot reads a day, keyed `img:<visitor hash>`, separate from live runs.
export const LIMITS = { global: 20, visitor: 3, draftPerToken: 2, judgePerAnswer: 2, linePerToken: 15, imagePerVisitor: 6 } as const;

export type CapStore = {
  /** Add 1 to today's count for key if it is below limit. True if it was added. */
  bump(key: string, limit: number): Promise<boolean>;
  count(key: string): Promise<number>;
};

export function memoryStore(): CapStore {
  const counts = new Map<string, number>();
  return {
    async bump(key, limit) {
      const n = counts.get(key) ?? 0;
      if (n >= limit) return false;
      counts.set(key, n + 1);
      return true;
    },
    async count(key) {
      return counts.get(key) ?? 0;
    },
  };
}

export function neonStore(url: string): CapStore {
  const sql = neon(url);
  return {
    async bump(key, limit) {
      const [rows] = await sql.transaction([
        sql`INSERT INTO live_counter (day, ip_hash, count) VALUES (current_date, ${key}, 1)
            ON CONFLICT (day, ip_hash) DO UPDATE SET count = live_counter.count + 1
            WHERE live_counter.count < ${limit}
            RETURNING count`,
        sql`DELETE FROM live_counter WHERE day < current_date - 1`,
      ]);
      return (rows as unknown[]).length === 1;
    },
    async count(key) {
      const rows = await sql`SELECT count FROM live_counter WHERE day = current_date AND ip_hash = ${key}`;
      return rows.length ? Number(rows[0].count) : 0;
    },
  };
}

/**
 * Visitor first, then global. A visitor already at 3 never touches the global count.
 * If the global cap is hit after the visitor bump, that visitor loses one run for the day:
 * nobody can run once the global cap is hit, so the lost run never matters.
 */
export async function reserveRun(store: CapStore, ipHash: string): Promise<"ok" | "capped_visitor" | "capped_global"> {
  if (!(await store.bump(ipHash, LIMITS.visitor))) return "capped_visitor";
  if (!(await store.bump("global", LIMITS.global))) return "capped_global";
  return "ok";
}

/**
 * A thin posting already took a run, so the retry with pasted text spends the retry token
 * from that refusal instead. Each token covers one retry; after that, runs reserve as usual.
 */
export async function reserveRunOrRetry(
  store: CapStore,
  ipHash: string,
  retryId: string | null,
): Promise<"ok" | "capped_visitor" | "capped_global"> {
  if (retryId && (await store.bump(`tok:${retryId}:retry`, 1))) return "ok";
  return reserveRun(store, ipHash);
}

export function useToken(store: CapStore, key: string, limit: number): Promise<boolean> {
  return store.bump(key, limit);
}

export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("base64url").slice(0, 22);
}

/** Vercel puts the caller's address first in x-forwarded-for. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
