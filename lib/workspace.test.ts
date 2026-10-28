import { describe, expect, it } from "vitest";
import { appendLines, buildLines, emptyWorkspace, addEntry } from "./workspace";

describe("buildLines", () => {
  it("numbers seed lines first, then voice entries after them", () => {
    const ws = addEntry(addEntry(emptyWorkspace(), { text: "I ran the pilot. It took six weeks.", source: "interview", prompt: "Proudest work?" }), {
      text: "It was three customers.",
      source: "gap",
    });
    const lines = buildLines("1. I am a product manager. I live in Pune.", {}, ws.entries);
    expect(lines.map((l) => `${l.id} ${l.text}`)).toEqual([
      "S1 I am a product manager.",
      "S2 I live in Pune.",
      "S3 I ran the pilot.",
      "S4 It took six weeks.",
      "S5 It was three customers.",
    ]);
  });

  it("applies the glossary to entries too", () => {
    const ws = addEntry(emptyWorkspace(), { text: "I built the REG bot myself.", source: "interview" });
    expect(buildLines("", { REG: "RAG" }, ws.entries)[0].text).toBe("I built the RAG bot myself.");
  });
});

describe("appendLines", () => {
  it("continues the run's S numbering for a gap answer", () => {
    const existing = [{ id: "S1", text: "One line here." }, { id: "S7", text: "Another line here." }];
    expect(appendLines(existing, "It was three customers. Only a pilot.", {})).toEqual([
      { id: "S8", text: "It was three customers." },
      { id: "S9", text: "Only a pilot." },
    ]);
  });
});

describe("addEntry", () => {
  it("adds a stamped entry and leaves the old workspace untouched", () => {
    const ws = emptyWorkspace();
    const next = addEntry(ws, { text: "I led the launch.", source: "memo" });
    expect(ws.entries).toHaveLength(0);
    expect(next.entries[0]).toMatchObject({ text: "I led the launch.", source: "memo" });
    expect(next.entries[0].id).toMatch(/^E\d+/);
  });
});
