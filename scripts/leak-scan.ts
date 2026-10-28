/**
 * Fails if any file that deploys holds a line from stories/bank.md or a name from
 * config/leak-names.local.json. Both sources are local and gitignored, so the scan only
 * means something on Gaurav's machine; elsewhere it says it was skipped.
 *   npx tsx scripts/leak-scan.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { splitBank } from "../lib/engine/bank";
import { findLeaks, needlesFrom } from "../lib/leak";

const names: string[] = existsSync("config/leak-names.local.json")
  ? (JSON.parse(readFileSync("config/leak-names.local.json", "utf8")) as { names: string[] }).names
  : [];
const storyLines = existsSync("stories/bank.md") ? splitBank(readFileSync("stories/bank.md", "utf8"), {}).map((l) => l.text) : [];

if (names.length === 0 && storyLines.length === 0) {
  console.log("leak scan skipped: no stories/bank.md and no config/leak-names.local.json here");
  process.exit(0);
}

// Every tracked file that Vercel uploads: .vercelignore entries are left out.
const ignored = readFileSync(".vercelignore", "utf8").split(/\r?\n/).map((l) => l.trim().replace(/^\//, "")).filter(Boolean); // "/stories/" is anchored at the root
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
const deployed = tracked.filter((p) => !ignored.some((ig) => p === ig.replace(/\/$/, "") || p.startsWith(ig.endsWith("/") ? ig : `${ig}/`)));
const files = deployed
  .filter((p) => !/\.(png|jpg|jpeg|gif|ico|woff2?|lock)$/i.test(p) && p !== "package-lock.json")
  .map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

const hits = findLeaks(files, needlesFrom({ names, storyLines }));
if (hits.length) {
  // Show where, never the matched text itself.
  for (const h of hits) console.error(`LEAK in ${h.path}: matches a ${h.needle.length > 40 ? "story line" : "listed name"}`);
  process.exit(1);
}
console.log(`leak scan passed: ${files.length} deployed files, ${names.length} names, ${storyLines.length} story lines`);
