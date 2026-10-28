/**
 * Create live_counter in Neon and prove one write and read, the same check /api/health runs.
 *   npx tsx scripts/db-check.ts
 * DATABASE_URL comes from the environment, or from gopass when unset. It is never printed.
 */
import { execFileSync } from "node:child_process";
import { checkDb } from "../lib/db";

const GOPASS = "C:\\Users\\Gaurav Gupta\\AppData\\Local\\gopass\\gopass.exe";

async function main() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = execFileSync(GOPASS, ["show", "-o", "voice-proof-desk/DATABASE_URL"], { encoding: "utf8" }).trim();
  }
  const status = await checkDb();
  console.log(`db: ${status}`);
  if (status !== "ok") process.exit(1);
}

main().catch((err) => {
  console.error(`db check failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
