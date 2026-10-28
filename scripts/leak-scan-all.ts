/**
 * Leak scan over every tracked file, for the public repo cut (Slice 6). Same needles as
 * leak-scan.ts. Prints file paths only, never the matched text.
 *   npx tsx scripts/leak-scan-all.ts [--dir <folder>]
 */
import { execFileSync } from "node:child_process";
import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
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

// With --dir, scan every file under that folder (the public cut). Otherwise every tracked file.
const dirFlag = process.argv.indexOf("--dir");
const paths =
  dirFlag > 0
    ? (readdirSync(process.argv[dirFlag + 1], { recursive: true, withFileTypes: true }) as Dirent[])
        .filter((d) => d.isFile() && !d.parentPath.split(/[\\/]/).includes(".git"))
        .map((d) => path.join(d.parentPath, d.name))
    : execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const files = paths
  .filter((p) => !/\.(png|jpg|jpeg|gif|ico|woff2?|lock)$/i.test(p) && p !== "package-lock.json")
  .map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

const hits = findLeaks(files, needlesFrom({ names, storyLines }));
const byPath = new Map<string, number>();
for (const h of hits) byPath.set(h.path, (byPath.get(h.path) ?? 0) + 1);
for (const [p, n] of byPath) console.error(`LEAK in ${p}: ${n} match(es)`);
console.log(`${files.length} files scanned, ${byPath.size} with leaks`);
process.exit(byPath.size ? 1 : 0);
