import type { StoryLine } from "./schema";

/** Split prose into sentences. Fragments under 8 characters ("Ok.") are dropped. */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rule 5: glossary fixes run before the split, on word boundaries, any case. */
export function applyGlossary(text: string, glossary: Record<string, string>): string {
  let out = text;
  for (const [wrong, right] of Object.entries(glossary)) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(wrong)}\\b`, "gi"), right);
  }
  return out;
}

const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const SKIP = /^\s*(#|===|\*\*Fictional)/;

/**
 * Turn a dictated bank into numbered evidence lines, one per sentence.
 * If the bank has numbered items, only those count (headers and notes are not stories).
 * Otherwise every plain line counts.
 */
export function splitBank(raw: string, glossary: Record<string, string>): StoryLine[] {
  const lines = applyGlossary(raw, glossary).split(/\r?\n/);
  const hasItems = lines.some((l) => NUMBERED.test(l));
  const chunks: { text: string; item?: number }[] = [];

  for (const line of lines) {
    if (!line.trim() || SKIP.test(line)) continue;
    const m = NUMBERED.exec(line);
    if (m) {
      chunks.push({ text: m[2], item: Number(m[1]) });
    } else if (hasItems) {
      if (chunks.length > 0) chunks[chunks.length - 1].text += ` ${line.trim()}`;
    } else {
      chunks.push({ text: line.trim() });
    }
  }

  const out: StoryLine[] = [];
  for (const chunk of chunks) {
    for (const text of splitSentences(chunk.text)) {
      out.push(chunk.item === undefined ? { id: `S${out.length + 1}`, text } : { id: `S${out.length + 1}`, text, item: chunk.item });
    }
  }
  return out;
}
