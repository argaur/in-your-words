import { z } from "zod";
import { splitSentences } from "./bank";
import { askJson, EngineError, Meter, MODELS } from "./llm";
import { COMPANY_SYSTEM } from "./prompts";
import type { WebLine } from "./schema";

const TAVILY_URL = "https://api.tavily.com";
const THIN_WORDS = 150; // rule 13
const MAX_POSTING_LINES = 40;
const MAX_SEARCH_LINES = 40;

type TavilyExtract = { results: { url: string; raw_content: string }[]; failed_results?: unknown[]; usage?: { credits?: number } };
type TavilySearch = { results: { url: string; content: string }[]; usage?: { credits?: number } };

async function tavily<T>(path: string, body: object): Promise<T> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new EngineError("config", "TAVILY_API_KEY is not set");
  const res = await fetch(`${TAVILY_URL}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, include_usage: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new EngineError("tavily_failed", `Tavily ${path} returned ${res.status}`);
  return (await res.json()) as T;
}

export type ResearchResult = {
  company: string;
  posting_text: string;
  extract_words: number;
  web_lines: WebLine[];
  tavily_credits: number;
  usage: ReturnType<Meter["usage"]>;
};

/** Step 1: read the posting, name the company, search for it. Throws thin_posting under 150 words. */
export async function research(input: { posting_url: string; posting_text?: string }): Promise<ResearchResult> {
  const meter = new Meter();
  let credits = 0;
  let posting = input.posting_text?.trim() ?? "";

  if (!posting) {
    const ext = await tavily<TavilyExtract>("extract", { urls: [input.posting_url] });
    credits += ext.usage?.credits ?? 0;
    posting = ext.results[0]?.raw_content ?? "";
  }
  const words = posting.split(/\s+/).filter(Boolean).length;
  if (words < THIN_WORDS) {
    throw new EngineError("thin_posting", `Only ${words} words could be read from the posting`);
  }

  const { company } = await askJson(
    z.object({ company: z.string().min(1) }),
    MODELS.judge,
    COMPANY_SYSTEM,
    posting.slice(0, 2500),
    meter,
    600,
  );

  const search = await tavily<TavilySearch>("search", {
    query: `${company} company products customers news`,
    max_results: 5,
    search_depth: "advanced",
    chunks_per_source: 3,
  });
  credits += search.usage?.credits ?? 0;

  const lines: { text: string; url: string }[] = [
    ...splitSentences(posting).slice(0, MAX_POSTING_LINES).map((text) => ({ text, url: input.posting_url })),
    ...search.results.flatMap((r) => splitSentences(r.content).map((text) => ({ text, url: r.url }))).slice(0, MAX_SEARCH_LINES),
  ];

  return {
    company,
    posting_text: posting,
    extract_words: words,
    web_lines: lines.map((l, i) => ({ id: `W${i + 1}`, text: l.text, url: l.url })),
    tavily_credits: credits,
    usage: meter.usage(),
  };
}
