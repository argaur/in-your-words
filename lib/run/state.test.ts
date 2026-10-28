import { describe, expect, it } from "vitest";
import type { Answer, Run, Sentence } from "../engine/schema";
import { answerText, counts, cutAgain, markSentence, restoreSentence, runReducer, shownQuote } from "./state";

function s(id: string, over: Partial<Sentence> = {}): Sentence {
  return {
    id,
    text: `Sentence ${id}.`,
    label: "spoken",
    source_ids: ["S1"],
    status: "kept",
    number_check: { numbers: [], passed: true, missing: [] },
    generic: false,
    verdict: "none",
    marked_blind: false,
    ...over,
  };
}

function run(sentences: Sentence[]): Run {
  const answer: Answer = { question_id: "Q1", sentences, unanswered: null, char_count: 0, word_count: 0 };
  return {
    run_id: "r1",
    mode: "local",
    persona: true,
    bank_source: "persona",
    posting_url: "https://example.com/job",
    company: "Haulcraft",
    steps: { research: "done", draft: "done", judge: "done" },
    fallback_model: false,
    usage: {
      research: { tokens: 0, seconds: 0, cost_estimate: 0 },
      draft: { tokens: 0, seconds: 0, cost_estimate: 0 },
      judge: { tokens: 0, seconds: 0, cost_estimate: 0 },
    },
    timer_active_seconds: 0,
    story_lines: [{ id: "S1", text: "We labelled 400 past exceptions in two weeks." }],
    web_lines: [],
    questions: [{ id: "Q1", text: "Why this role?", kind: "essay" }],
    answers: [answer],
  };
}

const find = (r: Run, id: string) => r.answers[0].sentences.find((x) => x.id === id)!;

describe("marks", () => {
  it("sets a verdict and leaves the status alone", () => {
    const r = markSentence(run([s("Q1-1")]), "Q1-1", "false");
    expect(find(r, "Q1-1").verdict).toBe("false");
    expect(find(r, "Q1-1").status).toBe("kept");
  });

  it("pressing the same mark again clears it", () => {
    const once = markSentence(run([s("Q1-1")]), "Q1-1", "true");
    expect(find(markSentence(once, "Q1-1", "true"), "Q1-1").verdict).toBe("none");
  });

  it("records that a mark was made blind, and clears that with the mark", () => {
    const blind = markSentence(run([s("Q1-1")]), "Q1-1", "true", true);
    expect(find(blind, "Q1-1").marked_blind).toBe(true);
    expect(find(markSentence(blind, "Q1-1", "true", true), "Q1-1").marked_blind).toBe(false);
  });

  it("the reducer stores the timer's active seconds on the run", () => {
    const r = runReducer(run([s("Q1-1")]), { type: "timer", seconds: 312 });
    expect(r?.timer_active_seconds).toBe(312);
  });

  it("does not change the input run", () => {
    const before = run([s("Q1-1")]);
    markSentence(before, "Q1-1", "true");
    expect(find(before, "Q1-1").verdict).toBe("none");
  });
});

describe("restore and cut again", () => {
  it("restores a cut line and keeps its reason", () => {
    const r = restoreSentence(run([s("Q1-1", { status: "cut", cut_reason: "Number not in your stories: 42" })]), "Q1-1");
    expect(find(r, "Q1-1").status).toBe("restored");
    expect(find(r, "Q1-1").cut_reason).toBe("Number not in your stories: 42");
  });

  it("only restores lines that were cut", () => {
    expect(find(restoreSentence(run([s("Q1-1")]), "Q1-1"), "Q1-1").status).toBe("kept");
  });

  it("cut again puts a restored line back", () => {
    const r = cutAgain(run([s("Q1-1", { status: "restored", cut_reason: "x" })]), "Q1-1");
    expect(find(r, "Q1-1").status).toBe("cut");
  });

  it("recounts the answer after a restore", () => {
    const r = restoreSentence(run([s("Q1-1"), s("Q1-2", { status: "cut", cut_reason: "x", text: "Two more words." })]), "Q1-2");
    expect(r.answers[0].word_count).toBe(5);
  });
});

describe("answer text for the clipboard", () => {
  it("joins kept and restored lines as plain text, no IDs or tags", () => {
    const a = run([s("Q1-1"), s("Q1-2", { status: "cut", cut_reason: "x" }), s("Q1-3", { status: "restored" })]).answers[0];
    expect(answerText(a)).toBe("Sentence Q1-1. Sentence Q1-3.");
  });
});

describe("counts", () => {
  it("counts plain numbers, no score", () => {
    const a = run([
      s("1"),
      s("2", { label: "web", source_ids: ["W1"] }),
      s("3", { label: "inference", source_ids: [], generic: true }),
      s("4", { status: "cut", cut_reason: "x" }),
      s("5", { status: "restored", cut_reason: "x" }),
    ]).answers[0];
    expect(counts(a)).toEqual({ kept: 3, cut: 1, fromWords: 1, notBacked: 2, generic: 1 });
  });
});

describe("quote shown under a claim", () => {
  it("uses the drafter quote when it holds every number", () => {
    const r = run([]);
    const line = s("Q1-1", { quote: "400 past exceptions", number_check: { numbers: ["400"], passed: true, missing: [] } });
    expect(shownQuote(line, r)).toBe("400 past exceptions");
  });

  it("falls back to the full cited line when the quote drops a number", () => {
    const r = run([]);
    const line = s("Q1-1", { quote: "past exceptions", number_check: { numbers: ["400"], passed: true, missing: [] } });
    expect(shownQuote(line, r)).toBe("We labelled 400 past exceptions in two weeks.");
  });
});

describe("v2 studio changes", () => {
  it("an edit changes the words, shows the line and marks it not checked", () => {
    const r = runReducer(run([s("Q1-1", { status: "cut", cut_reason: "x" })]), { type: "edit", id: "Q1-1", text: "I led the pilot." }) as Run;
    const line = r.answers[0].sentences[0];
    expect(line).toMatchObject({ text: "I led the pilot.", edited: true, status: "restored" });
    expect(answerText(r.answers[0])).toBe("I led the pilot.");
    expect(r.answers[0].word_count).toBe(4);
  });

  it("a fixed line replaces the old one by id and clears the edited flag", () => {
    const start = runReducer(run([s("Q1-1"), s("Q1-2", { status: "cut" })]), { type: "edit", id: "Q1-2", text: "Mine." }) as Run;
    const fixed = s("Q1-2", { text: "I ran it for six weeks.", source_ids: ["S2"] });
    const r = runReducer(start, { type: "replace", sentence: fixed }) as Run;
    expect(r.answers[0].sentences[1]).toEqual(fixed);
    expect(r.answers[0].sentences[1].edited).toBeUndefined();
  });

  it("gap answers join the run's evidence", () => {
    const r = runReducer(run([s("Q1-1")]), { type: "addLines", lines: [{ id: "S2", text: "It was three customers." }] }) as Run;
    expect(r.story_lines.map((l) => l.id)).toEqual(["S1", "S2"]);
  });
});
