/**
 * Slice 1: run the full engine from the command line, same functions the routes call.
 *   npx tsx scripts/engine.ts --bank samples/meera --url <posting url> [--out runs/local]
 * Keys come from the environment, or from gopass when unset. They are never printed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { splitBank } from "../lib/engine/bank";
import { draft } from "../lib/engine/draft";
import { judgeAnswer } from "../lib/engine/judge";
import { research } from "../lib/engine/research";
import { RunSchema, type Question, type Run } from "../lib/engine/schema";

const GOPASS = "C:\\Users\\Gaurav Gupta\\AppData\\Local\\gopass\\gopass.exe";

function loadKey(name: string): void {
  if (process.env[name]) return;
  process.env[name] = execFileSync(GOPASS, ["show", "-o", `voice-proof-desk/${name}`], { encoding: "utf8" }).trim();
}

function arg(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`missing ${flag}`);
  return value;
}

const DEFAULT_QUESTIONS: Question[] = [
  { id: "Q1", kind: "essay", word_limit: 150, text: "Why are you interested in this role?" },
  { id: "Q2", kind: "essay", word_limit: 200, text: "Tell us about an AI product you shipped and how you measured whether it worked." },
  { id: "Q3", kind: "outreach_short", text: "A LinkedIn connection note to the hiring manager for this role." },
  { id: "Q4", kind: "outreach_long", text: "A referral ask to someone who works at the company." },
];

async function main() {
  loadKey("NEBIUS_API_KEY");
  loadKey("TAVILY_API_KEY");
  const bankDir = arg("--bank", "samples/meera");
  const postingUrl = arg("--url");
  const outDir = arg("--out", "runs/local");
  const persona = bankDir.includes("samples/meera");

  const raw = readFileSync(path.join(bankDir, "bank.md"), "utf8");
  const glossary = JSON.parse(readFileSync(path.join(bankDir, "glossary.json"), "utf8")) as Record<string, string>;
  const story_lines = splitBank(raw, glossary);
  console.log(`bank: ${story_lines.length} story lines`);

  const t0 = Date.now();
  const r = await research({ posting_url: postingUrl });
  console.log(`research: ${r.company}, ${r.extract_words} words, ${r.web_lines.length} web lines, ${r.usage.seconds}s, ${r.tavily_credits} Tavily credits`);

  const d = await draft({ company: r.company, story_lines, web_lines: r.web_lines, questions: DEFAULT_QUESTIONS });
  console.log(`draft: ${d.drafts.length} answers, ${d.usage.seconds}s, $${d.usage.cost_estimate}, fallback ${d.fallback_model}, retries ${d.retries}`);

  const answers = [];
  const judgeUsage = { tokens: 0, seconds: 0, cost_estimate: 0 };
  for (const q of DEFAULT_QUESTIONS) {
    const dr = d.drafts.find((a) => a.question_id === q.id) ?? { question_id: q.id, sentences: [], unanswered: null };
    const j = await judgeAnswer({ draft: dr, question: q, company: r.company, story_lines, web_lines: r.web_lines });
    const kept = j.answer.sentences.filter((s) => s.status === "kept").length;
    console.log(`judge ${q.id}: ${j.answer.sentences.length} sentences, ${kept} kept, ${j.usage.seconds}s, $${j.usage.cost_estimate}${j.answer.unanswered ? ` UNANSWERED (${j.answer.unanswered.topic})` : ""}`);
    answers.push(j.answer);
    judgeUsage.tokens += j.usage.tokens;
    judgeUsage.seconds += j.usage.seconds;
    judgeUsage.cost_estimate += j.usage.cost_estimate;
  }

  const run: Run = RunSchema.parse({
    run_id: `${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`,
    mode: "local",
    persona,
    bank_source: persona ? "persona" : "file",
    posting_url: postingUrl,
    company: r.company,
    steps: { research: "done", draft: "done", judge: "done" },
    fallback_model: d.fallback_model,
    usage: { research: r.usage, draft: d.usage, judge: judgeUsage },
    timer_active_seconds: 0,
    story_lines,
    web_lines: r.web_lines,
    questions: DEFAULT_QUESTIONS,
    answers,
  });

  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${run.run_id}.json`);
  writeFileSync(file, JSON.stringify(run, null, 2));
  const total = r.usage.cost_estimate + d.usage.cost_estimate + judgeUsage.cost_estimate;
  console.log(`total: ${Math.round((Date.now() - t0) / 1000)}s wall, $${total.toFixed(4)} model cost, ${r.tavily_credits} Tavily credits -> ${file}`);
}

main().catch((err) => {
  console.error(`engine failed: ${err instanceof Error ? `${(err as { code?: string }).code ?? ""} ${err.message}` : err}`);
  process.exit(1);
});
