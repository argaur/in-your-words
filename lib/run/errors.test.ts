import { describe, expect, it } from "vitest";
import { stepMessage } from "./errors";

describe("stepMessage", () => {
  const raw = "nvidia/nemotron-3-super-120b-a12b returned no valid JSON after 2 tries (Invalid input: expected string, received null)";

  it("never shows a visitor the model name or schema text", () => {
    const m = stepMessage("no_json", raw, false);
    expect(m).not.toMatch(/nemotron|JSON|Invalid input/i);
    expect(m.length).toBeGreaterThan(10);
  });

  it("keeps the raw text in local mode, for debugging", () => {
    expect(stepMessage("no_json", raw, true)).toBe(raw);
  });

  it("has plain text for the known codes and a fallback for the rest", () => {
    for (const code of ["no_json", "tavily_failed", "token_used", "bad_token", "do_not_send", "config", "internal", "something_new"]) {
      expect(stepMessage(code, "x", false)).not.toBe("x");
    }
  });
});
