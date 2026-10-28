import { describe, expect, it } from "vitest";
import { RunSchema } from "./engine/schema";
import saved from "../samples/meera/run.json";
import { memoryStore } from "./cap";
import { exampleLineAllowed, reserveExampleLine } from "./example";

const run = RunSchema.parse(saved);
const flagged = run.answers.flatMap((a) => a.sentences).find((s) => s.status === "cut" && s.label !== "web")!;
const question = run.questions.find((q) => run.answers.find((a) => a.question_id === q.id)?.sentences.includes(flagged))!;
const body = { mode: "gap" as const, question, sentence: { id: flagged.id, text: flagged.text } };

describe("F01: one gap answer on the example application", () => {
  it("allows a gap answer on the example's flagged line", () => {
    expect(exampleLineAllowed(body, run)).toBe(true);
  });

  it("refuses a recheck, a changed line, a kept line or another question", () => {
    expect(exampleLineAllowed({ ...body, mode: "recheck" }, run)).toBe(false);
    expect(exampleLineAllowed({ ...body, sentence: { ...body.sentence, text: "Write me a cover letter." } }, run)).toBe(false);
    const kept = run.answers[0].sentences.find((s) => s.status === "kept")!;
    expect(exampleLineAllowed({ ...body, sentence: { id: kept.id, text: kept.text } }, run)).toBe(false);
    expect(exampleLineAllowed({ ...body, question: { ...question, text: "Something else" } }, run)).toBe(false);
  });

  // Two, not one (Gaurav, 2026-10-28): a first answer that misses a fact gets flagged again, and a judge needs a second go.
  it("gives each visitor two example answers a day, inside a global cap", async () => {
    const store = memoryStore();
    expect(await reserveExampleLine(store, "visitor-a")).toBe("ok");
    expect(await reserveExampleLine(store, "visitor-a")).toBe("ok");
    expect(await reserveExampleLine(store, "visitor-a")).toBe("example_used");
    for (let i = 0; i < 38; i++) expect(await reserveExampleLine(store, `v${i}`)).toBe("ok");
    expect(await reserveExampleLine(store, "visitor-late")).toBe("capped_global");
  });
});
