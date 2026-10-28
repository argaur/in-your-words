/**
 * "In your own words" rules (PRODUCT_V2.md section 7). Code only, no model calls:
 * words the speaker never used are flagged, and every flagged line gets one question back.
 */
import type { NumberCheck } from "./numbers";
import type { Label } from "./schema";

/** Words AI drafts reach for and people rarely say. Allowed when the speaker said them. */
export const AI_WORDS = [
  "spearheaded", "spearhead", "leveraged", "leverage", "leveraging", "passionate", "robust", "seamless", "seamlessly",
  "synergy", "synergies", "utilize", "utilized", "utilizing", "orchestrated", "championed", "pivotal", "cutting-edge",
  "game-changer", "transformative", "delve", "fostered", "foster", "meticulous", "meticulously", "visionary",
  "unparalleled", "holistic", "empower", "empowered", "streamlined", "paradigm", "innovative", "dynamic",
];

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []);
}

/** AI words in a drafted line that never appear in the speaker's own stories, in sentence order. */
export function aiWords(sentence: string, storyText: string): string[] {
  const said = words(storyText);
  const order = sentence.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? [];
  return [...new Set(order.filter((w) => AI_WORDS.includes(w) && !said.has(w)))];
}

/** Reasons written by the code rules in rules.ts, not by the judge. */
const RULE_REASONS = ["No line from your stories is cited", "No web source is cited", "A linking line cannot add a number", "Number not in"];

/**
 * The one question shown under a flagged line. The judge's own question wins; otherwise a
 * plain question from the reason. Web lines are about the employer, so the user is never asked.
 */
export function askFor(s: { label: Label; cut_reason?: string }, numberCheck: NumberCheck, judgeAsk?: string): string | undefined {
  if (s.label === "web") return undefined;
  if (judgeAsk?.trim()) return judgeAsk.trim();
  if (!numberCheck.passed && numberCheck.missing.length) return `Where does ${numberCheck.missing.join(", ")} come from? Say it in your own words.`;
  if (s.cut_reason?.startsWith("Not how you said it")) return "How would you say this part yourself?";
  // A judge reason names what is missing, so the question says it too. Fixed rule reasons do not.
  const reason = s.cut_reason?.trim();
  if (reason && !RULE_REASONS.some((r) => reason.startsWith(r))) {
    return `${reason.replace(/[.\s]+$/, "")}. What did you actually do? Say it in your own words.`;
  }
  return "What did you do here? Say it in your own words.";
}
