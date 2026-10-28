import OpenAI from "openai";
import type { z } from "zod";

export const TOKEN_FACTORY_URL = "https://api.tokenfactory.nebius.com/v1/";

/** IDs proven in the spike (spike.py lines 24 and 25). Overridable for the fallback test. */
export const MODELS = {
  draft: process.env.DRAFT_MODEL ?? "nvidia/Nemotron-3-Ultra-550b-a55b",
  judge: process.env.JUDGE_MODEL ?? "nvidia/nemotron-3-super-120b-a12b",
  // v2 screenshot paste. Listed by /v1/models on 2026-10-27.
  vision: process.env.VISION_MODEL ?? "nvidia/Nemotron-3.5-Super-VL",
};

/** A user turn: plain text, or text plus one image (screenshot paste). */
export type UserContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

/** USD per 1M tokens, from nebius-2026/COSTS.md (read 2026-10-25). */
const PRICES: Record<string, { input: number; output: number }> = {
  "nvidia/Nemotron-3-Ultra-550b-a55b": { input: 1.0, output: 3.0 },
  "nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 0.9 },
};

export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export class Meter {
  tokens = 0;
  cost = 0;
  retries = 0;
  private started = Date.now();

  add(model: string, prompt: number, completion: number): void {
    this.tokens += prompt + completion;
    const p = PRICES[model] ?? { input: 1.0, output: 3.0 };
    this.cost += (prompt * p.input + completion * p.output) / 1_000_000;
  }

  usage() {
    return {
      tokens: this.tokens,
      seconds: Math.round((Date.now() - this.started) / 100) / 10,
      cost_estimate: Math.round(this.cost * 10000) / 10000,
    };
  }
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.NEBIUS_API_KEY;
  if (!apiKey) throw new EngineError("config", "NEBIUS_API_KEY is not set");
  client ??= new OpenAI({ baseURL: TOKEN_FACTORY_URL, apiKey, timeout: 120_000, maxRetries: 1 });
  return client;
}

/** Pull the JSON object out of a reply. Nemotron may reason in plain text first. */
export function extractJson(text: string): unknown {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Rule 4: a reply that does not parse gets one retry, then a clear error. Never a partial result. */
export async function askJson<T>(
  schema: z.ZodType<T>,
  model: string,
  system: string,
  user: UserContent,
  meter: Meter,
  maxTokens: number,
  opts: { thinking?: boolean } = {},
): Promise<T> {
  let lastProblem = "";
  // Nemotron reasons before answering and can spend the whole budget there (finish_reason
  // "length", seen 2026-10-26). thinking: false turns that off through the chat template.
  const extra = opts.thinking === false ? { chat_template_kwargs: { enable_thinking: false } } : {};
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await getClient().chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...extra,
    } as Parameters<OpenAI["chat"]["completions"]["create"]>[0] & { stream?: false });
    meter.add(model, r.usage?.prompt_tokens ?? 0, r.usage?.completion_tokens ?? 0);
    const parsed = schema.safeParse(extractJson(r.choices[0]?.message?.content ?? ""));
    if (parsed.success) return parsed.data;
    lastProblem = parsed.error.issues[0]?.message ?? "no JSON";
    meter.retries += 1;
  }
  throw new EngineError("no_json", `${model} returned no valid JSON after 2 tries (${lastProblem})`);
}
