/**
 * Number rule (PRD rule 2). Pure code, never overruled by the model.
 * A number in a sentence must appear in the cited evidence. Words become digits
 * ("seven" to 7, but not "one", which is mostly an article in speech), "percent"
 * equals "%", commas drop. A rounded number passes only when the evidence says
 * "about" or "around" that number and the gap is under 10%.
 */

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const WORDS =
  /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi;
const APPROX = /\b(about|around|roughly|nearly|almost|approximately)\s+$/i;
const NUMBER = /(?<![A-Za-z\d.])\d+(?:\.\d+)?(?![A-Za-z\d])/g;

type Found = { value: string; approx: boolean };

function wordsToDigits(text: string): string {
  return text.replace(WORDS, (_m, tens?: string, unit?: string, single?: string) => {
    if (tens) return String(TENS[tens.toLowerCase()] + (unit ? UNITS[unit.toLowerCase()] : 0));
    return String(UNITS[(single as string).toLowerCase()]);
  });
}

function find(text: string): Found[] {
  const clean = wordsToDigits(text.replace(/(\d),(?=\d{3}\b)/g, "$1"));
  const out: Found[] = [];
  for (const m of clean.matchAll(NUMBER)) {
    const before = clean.slice(Math.max(0, (m.index ?? 0) - 16), m.index);
    out.push({ value: String(Number(m[0])), approx: APPROX.test(before) });
  }
  return out;
}

export function extractNumbers(text: string): string[] {
  return find(text).map((f) => f.value);
}

export type NumberCheck = { numbers: string[]; passed: boolean; missing: string[] };

export function checkNumbers(sentence: string, evidence: string[]): NumberCheck {
  const numbers = extractNumbers(sentence);
  const found = evidence.flatMap(find);
  const exact = new Set(found.map((f) => f.value));
  const approx = found.filter((f) => f.approx).map((f) => Number(f.value));
  const missing = numbers.filter((n) => {
    if (exact.has(n)) return false;
    const x = Number(n);
    return !approx.some((a) => a !== 0 && Math.abs(x - a) / a < 0.1);
  });
  return { numbers, passed: missing.length === 0, missing: [...new Set(missing)] };
}
