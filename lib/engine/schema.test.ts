import { describe, expect, it } from "vitest";
import { DraftOutputSchema, JudgeOutputSchema, LineOutputSchema } from "./schema";

// Nemotron sends null for fields it has nothing to say in. A null must read as "not given",
// not fail the whole step (production, 27 Oct: "expected string, received null").
describe("model output schemas accept null for optional fields", () => {
  it("judge: a supported verdict with ask null", () => {
    const out = JudgeOutputSchema.parse({ verdict: "supported", reason: "S18 says 71 percent", ask: null });
    expect(out.ask).toBeUndefined();
  });

  it("draft: a sentence with quote null", () => {
    const out = DraftOutputSchema.parse({ answers: [{ question_id: "q1", sentences: [{ text: "Flexport builds agents.", label: "web", source_ids: ["W1"], quote: null }] }] });
    expect(out.answers[0].sentences[0].quote).toBeUndefined();
  });

  it("line: a rewrite with quote null", () => {
    const out = LineOutputSchema.parse({ text: "I ran the pilot.", label: "spoken", source_ids: ["S67"], quote: null });
    expect(out.quote).toBeUndefined();
  });
});
