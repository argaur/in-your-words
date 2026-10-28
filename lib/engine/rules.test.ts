import { describe, expect, it } from "vitest";
import { applyGlossary, splitBank, splitSentences } from "./bank";
import { checkDoNotSend, decideKeep, flagGeneric, isUnanswered, nameLines, windowIds } from "./rules";

describe("nameLines", () => {
  const story = [
    { id: "S1", text: "Right now I'm at a company I'll call FleetGrid." },
    { id: "S2", text: "FleetGrid sells dispatch software." },
    { id: "S3", text: "I shipped an AI triage feature." },
  ];

  it("adds the first story line that names a proper noun the window lacks", () => {
    expect(nameLines("I shipped an AI triage feature at FleetGrid.", story, ["S3"])).toEqual(["S1"]);
  });

  it("adds nothing when the window already names it", () => {
    expect(nameLines("FleetGrid sells dispatch software.", story, ["S2"])).toEqual([]);
  });

  it("ignores the first word and short words", () => {
    expect(nameLines("Shipped it at FleetGrid.", story, ["S1"])).toEqual([]);
    expect(nameLines("I shipped AI.", story, ["S3"])).toEqual([]);
  });
});

describe("splitSentences", () => {
  it("splits on sentence ends and drops fragments", () => {
    expect(splitSentences("I shipped it. Then I ran the pilot! Ok.")).toEqual(["I shipped it.", "Then I ran the pilot!"]);
  });
});

describe("applyGlossary", () => {
  it("fixes misheard words on word boundaries, any case", () => {
    expect(applyGlossary("we used jeera at Fleet grid", { jeera: "Jira", "fleet grid": "FleetGrid" })).toBe(
      "we used Jira at FleetGrid",
    );
  });
});

describe("splitBank", () => {
  const raw = [
    "Story bank (sample)",
    "",
    "**Fictional.** This header is not a story.",
    "===",
    "# Session 1",
    "",
    "1. I'm a senior product manager. Ten years in product in total.",
    "2. Right now I'm at FleetGrid. I joined in March 2021.",
  ].join("\n");

  it("keeps only numbered items when the bank has them, one line per sentence", () => {
    const lines = splitBank(raw, {});
    expect(lines.map((l) => l.id)).toEqual(["S1", "S2", "S3", "S4"]);
    expect(lines[0]).toEqual({ id: "S1", text: "I'm a senior product manager.", item: 1 });
    expect(lines[3].item).toBe(2);
  });

  it("uses every plain line when the bank has no numbered items", () => {
    const lines = splitBank("I wrote the spec for the triage feature. I ran the pilot myself.", {});
    expect(lines).toHaveLength(2);
    expect(lines[1].item).toBeUndefined();
  });

  it("applies the glossary before splitting", () => {
    const lines = splitBank("1. We tracked it in jeera every single week.", { jeera: "Jira" });
    expect(lines[0].text).toContain("Jira");
  });
});

describe("windowIds", () => {
  it("adds 3 lines either side of each cited id, inside the evidence", () => {
    const known = new Set(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9"]);
    expect(windowIds(["S5"], known)).toEqual(["S2", "S3", "S4", "S5", "S6", "S7", "S8"]);
    expect(windowIds(["S1"], known)).toEqual(["S1", "S2", "S3", "S4"]);
  });
});

describe("decideKeep", () => {
  const ok = { numbers: [], passed: true, missing: [] };

  it("keeps a supported spoken line with a story id", () => {
    expect(decideKeep({ label: "spoken", source_ids: ["S2"], judge: "supported", judgeReason: "ok", numberCheck: ok })).toEqual({
      status: "kept",
    });
  });

  it("cuts a spoken line with no story id (rule 3)", () => {
    const r = decideKeep({ label: "spoken", source_ids: ["W1"], judge: "supported", judgeReason: "ok", numberCheck: ok });
    expect(r).toEqual({ status: "cut", cut_reason: "No line from your stories is cited" });
  });

  it("cuts a web line with no web id (rule 3)", () => {
    const r = decideKeep({ label: "web", source_ids: [], judge: "supported", judgeReason: "ok", numberCheck: ok });
    expect(r.status).toBe("cut");
  });

  it("lets the number rule overrule a supported verdict (rule 2)", () => {
    const r = decideKeep({
      label: "spoken",
      source_ids: ["S2"],
      judge: "supported",
      judgeReason: "ok",
      numberCheck: { numbers: ["42"], passed: false, missing: ["42"] },
    });
    expect(r).toEqual({ status: "cut", cut_reason: "Number not in your stories: 42" });
  });

  it("names the web as the missing source for a web line", () => {
    const r = decideKeep({
      label: "web",
      source_ids: ["W2"],
      judge: "supported",
      judgeReason: "ok",
      numberCheck: { numbers: ["300"], passed: false, missing: ["300"] },
    });
    expect(r.cut_reason).toBe("Number not in the web sources: 300");
  });

  it("cuts an inference line that carries a number", () => {
    const r = decideKeep({
      label: "inference",
      source_ids: [],
      judge: "supported",
      judgeReason: "ok",
      numberCheck: { numbers: ["3"], passed: false, missing: ["3"] },
    });
    expect(r).toEqual({ status: "cut", cut_reason: "A linking line cannot add a number: 3" });
  });

  it("uses the judge's reason when the judge says unsupported", () => {
    const r = decideKeep({ label: "spoken", source_ids: ["S2"], judge: "unsupported", judgeReason: "She ran one pilot, not each", numberCheck: ok });
    expect(r).toEqual({ status: "cut", cut_reason: "She ran one pilot, not each" });
  });
});

describe("flagGeneric", () => {
  const evidence = ["I built the triage feature at FleetGrid", "Dispatchers used it daily"];
  it("flags an inference line with no number and no name from the evidence", () => {
    expect(flagGeneric({ label: "inference", text: "I am passionate about building great products." }, evidence)).toBe(true);
  });
  it("does not flag an inference line that names something from the evidence", () => {
    expect(flagGeneric({ label: "inference", text: "That work at FleetGrid is why this role fits." }, evidence)).toBe(false);
  });
  it("never flags spoken or web lines", () => {
    expect(flagGeneric({ label: "spoken", text: "I am passionate about products." }, evidence)).toBe(false);
  });
});

describe("isUnanswered", () => {
  it("is true when more than half the sentences are cut", () => {
    expect(isUnanswered(["cut", "cut", "kept"])).toBe(true);
    expect(isUnanswered(["cut", "kept"])).toBe(false);
    expect(isUnanswered([])).toBe(true);
  });
});

describe("checkDoNotSend", () => {
  it("matches the company name, any case", () => {
    expect(checkDoNotSend({ company: "fleetgrid", posting_url: "https://jobs.example.com/1" }, ["FleetGrid"])).toBe(true);
  });
  it("matches the company inside the posting host", () => {
    expect(checkDoNotSend({ company: "", posting_url: "https://careers.fleetgrid.io/pm" }, ["Fleet Grid"])).toBe(true);
  });
  it("lets other companies through", () => {
    expect(checkDoNotSend({ company: "Haulcraft", posting_url: "https://haulcraft.com/jobs" }, ["FleetGrid"])).toBe(false);
  });
});
