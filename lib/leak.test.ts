import { describe, expect, it } from "vitest";
import { findLeaks, needlesFrom } from "./leak";

describe("leak scan", () => {
  const needles = needlesFrom({
    names: ["Acmecorp", "Al"],
    storyLines: ["I ran the onboarding revamp at the bank for two whole years.", "Too short."],
  });

  it("drops names under 3 characters and story lines under 30", () => {
    expect(needles).toEqual(["acmecorp", "i ran the onboarding revamp at the bank for two whole years."]);
  });

  it("finds a planted name in any case", () => {
    const hits = findLeaks([{ path: "app/page.tsx", text: "Built at ACMECORP last year" }], needles);
    expect(hits).toEqual([{ path: "app/page.tsx", needle: "acmecorp" }]);
  });

  it("finds a story line even when the line breaks differ", () => {
    const hits = findLeaks([{ path: "samples/x.md", text: "I ran the onboarding revamp\nat the bank for two whole years." }], needles);
    expect(hits).toHaveLength(1);
  });

  it("passes clean files", () => {
    expect(findLeaks([{ path: "a.ts", text: "Meera Iyer at FleetGrid" }], needles)).toEqual([]);
  });
});
