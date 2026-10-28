import { neon } from "@neondatabase/serverless";

export type DbStatus = "ok" | "down" | "unconfigured";

/** One round trip that proves the live_counter table can be written and read. */
export async function checkDb(): Promise<DbStatus> {
  const url = process.env.DATABASE_URL;
  if (!url) return "unconfigured";
  try {
    const sql = neon(url);
    await sql`CREATE TABLE IF NOT EXISTS live_counter (
      day date NOT NULL, ip_hash text NOT NULL, count integer NOT NULL DEFAULT 0,
      PRIMARY KEY (day, ip_hash))`;
    await sql`INSERT INTO live_counter (day, ip_hash, count) VALUES (current_date, 'health', 1)
      ON CONFLICT (day, ip_hash) DO UPDATE SET count = live_counter.count + 1`;
    const rows = await sql`SELECT count FROM live_counter WHERE day = current_date AND ip_hash = 'health'`;
    return rows.length === 1 ? "ok" : "down";
  } catch (err) {
    console.error("health: db check failed", err instanceof Error ? err.message : err);
    return "down";
  }
}
