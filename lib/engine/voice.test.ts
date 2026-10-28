import { describe, expect, it } from "vitest";
import { aiWords, askFor } from "./voice";
import { decideKeep } from "./rules";

const ok = { numbers: [], passed: true, missing: [] };

describe("aiWords", () => {
  it("finds AI words the speaker never said", () => {
    expect(aiWords("I spearheaded the launch and leveraged data.", "I led the launch. I used our data.")).toEqual(["spearheaded", "leveraged"]);
  });

  it("allows a word the speaker said themself", () => {
    expect(aiWords("I am passionate about logistics.", "Honestly I am passionate about trucking software.")).toEqual([]);
  });

  it("matches whole words in any case", () => {
    expect(aiWords("Robust results.", "")).toEqual(["robust"]);
    expect(aiWords("Thrust and trust.", "")).toEqual([]);
  });
});

describe("decideKeep with AI words", () => {
  it("flags a supported line that uses an AI word", () => {
    const r = decideKeep({ label: "spoken", source_ids: ["S1"], judge: "supported", judgeReason: "", numberCheck: ok, aiWords: ["spearheaded"] });
    expect(r).toEqual({ status: "cut", cut_reason: "Not how you said it: spearheaded" });
  });

  it("number problems still come first", () => {
    const r = decideKeep({ label: "spoken", source_ids: ["S1"], judge: "supported", judgeReason: "", numberCheck: { numbers: ["42"], passed: false, missing: ["42"] }, aiWords: ["robust"] });
    expect(r.cut_reason).toBe("Number not in your stories: 42");
  });
});

describe("askFor", () => {
  it("asks where a missing number comes from", () => {
    expect(askFor({ label: "spoken", cut_reason: "Number not in your stories: 40%" }, { numbers: ["40%"], passed: false, missing: ["40%"] })).toBe(
      "Where does 40% come from? Say it in your own words.",
    );
  });

  it("asks how they would say it when an AI word was used", () => {
    expect(askFor({ label: "spoken", cut_reason: "Not how you said it: spearheaded" }, ok)).toBe("How would you say this part yourself?");
  });

  it("uses the judge's question when it gave one", () => {
    expect(askFor({ label: "spoken", cut_reason: "pilot scope missing" }, ok, "Was this across all customers or the pilot?")).toBe(
      "Was this across all customers or the pilot?",
    );
  });

  it("builds the fallback question from the judge's reason when the judge gave no question", () => {
    expect(askFor({ label: "spoken", cut_reason: "Pilot size is not in your stories." }, ok)).toBe(
      "Pilot size is not in your stories. What did you actually do? Say it in your own words.",
    );
  });

  it("falls back to a plain question for a spoken line", () => {
    expect(askFor({ label: "spoken", cut_reason: "No line from your stories is cited" }, ok)).toBe("What did you do here? Say it in your own words.");
  });

  it("never asks the user about a web line", () => {
    expect(askFor({ label: "web", cut_reason: "No web source is cited" }, ok)).toBeUndefined();
  });
});
