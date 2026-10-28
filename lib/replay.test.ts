import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RunSchema } from "./engine/schema";

describe("saved replay", () => {
  const raw = JSON.parse(readFileSync(path.join(__dirname, "..", "samples", "meera", "run.json"), "utf8"));

  it("parses against the one Run schema", () => {
    expect(() => RunSchema.parse(raw)).not.toThrow();
  });

  it("is the fictional persona in replay mode, with a kept and a cut line to show", () => {
    const run = RunSchema.parse(raw);
    expect(run.mode).toBe("replay");
    expect(run.persona).toBe(true);
    const all = run.answers.flatMap((a) => a.sentences);
    expect(all.some((s) => s.status === "kept" && s.label === "spoken")).toBe(true);
    expect(all.some((s) => s.status === "cut" && s.cut_reason)).toBe(true);
  });
});
