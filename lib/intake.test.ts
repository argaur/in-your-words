import { describe, expect, it } from "vitest";
import { boardOf, greenhouseQuestions, isEssay, leverQuestions, limitFrom, textQuestions } from "./intake";

describe("boardOf", () => {
  it("reads Lever links, with or without /apply", () => {
    expect(boardOf("https://jobs.lever.co/acmeco/1b2c3d4e-0000-4000-8000-000000000001")).toEqual({
      board: "lever",
      apply: "https://jobs.lever.co/acmeco/1b2c3d4e-0000-4000-8000-000000000001/apply",
    });
    expect(boardOf("https://jobs.eu.lever.co/acmeco/1b2c3d4e-0000-4000-8000-000000000001/apply?x=1")?.board).toBe("lever");
  });

  it("reads Greenhouse links on both hosts and the gh_jid form", () => {
    expect(boardOf("https://boards.greenhouse.io/acmeco/jobs/4012345")).toEqual({
      board: "greenhouse",
      apply: "https://boards-api.greenhouse.io/v1/boards/acmeco/jobs/4012345?questions=true",
    });
    expect(boardOf("https://job-boards.greenhouse.io/acmeco/jobs/4012345")?.board).toBe("greenhouse");
    expect(boardOf("https://acme.example/careers?gh_jid=4012345")).toBeNull();
  });

  it("returns null for other boards", () => {
    expect(boardOf("https://www.linkedin.com/jobs/view/123")).toBeNull();
    expect(boardOf("not a url")).toBeNull();
  });
});

describe("limitFrom", () => {
  it("reads word and character limits", () => {
    expect(limitFrom("Why us? (max 150 words)")).toBe(150);
    expect(limitFrom("Why us? Up to 600 characters.")).toBe(100);
    expect(limitFrom("Why us?")).toBeUndefined();
  });
});

const LEVER_HTML = `
<ul><li class="application-question resume"><div class="application-label">Resume/CV<span class="required">✱</span></div></li>
<li class="application-question"><div class="application-label">Full name<span class="required">✱</span></div></li>
<li class="application-question"><div class="application-label">Email<span class="required">✱</span></div></li>
<li class="application-question custom-question"><div class="application-label"><div class="text">What have you built with LLMs in the last year?<span class="required">✱</span></div></div></li>
<li class="application-question custom-question"><div class="application-label"><div class="text">Tell me about a time an AI feature failed &amp; what changed. (200 words max)</div></div></li>
<li class="application-question custom-question"><div class="application-label"><div class="text">Notice period?</div></div></li></ul>`;

describe("leverQuestions", () => {
  it("keeps custom questions and drops the standard fields", () => {
    expect(leverQuestions(LEVER_HTML)).toEqual([
      { text: "What have you built with LLMs in the last year?" },
      { text: "Tell me about a time an AI feature failed & what changed. (200 words max)", word_limit: 200 },
      { text: "Notice period?" },
    ]);
  });

  it("falls back to every non-standard label when there are no custom cards", () => {
    const html = `<div class="application-label">Full name</div><div class="application-label">Why do you want this role?</div>`;
    expect(leverQuestions(html)).toEqual([{ text: "Why do you want this role?" }]);
  });
});

describe("greenhouseQuestions", () => {
  it("keeps free-text questions and drops contact and file fields", () => {
    const json = {
      questions: [
        { label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
        { label: "Resume/CV", fields: [{ name: "resume", type: "input_file" }, { name: "resume_text", type: "textarea" }] },
        { label: "LinkedIn Profile", fields: [{ name: "question_1", type: "input_text" }] },
        { label: "Why are you excited about this role? (150 words)", fields: [{ name: "question_2", type: "textarea" }] },
        { label: "Are you authorized to work?", fields: [{ name: "question_3", type: "multi_value_single_select" }] },
      ],
    };
    expect(greenhouseQuestions(json)).toEqual([{ text: "Why are you excited about this role? (150 words)", word_limit: 150 }]);
  });
});

describe("isEssay", () => {
  it("pre-selects questions that need a story and skips form facts", () => {
    expect(isEssay("Tell me about a time an AI feature failed or gave wrong results.")).toBe(true);
    expect(isEssay("What have you personally built with LLMs or AI agents in the last year?")).toBe(true);
    expect(isEssay("How many years of experience do you have in AI?")).toBe(false);
    expect(isEssay("What is your expected CTC (Expected Cost to Company)?")).toBe(false);
    expect(isEssay("Let us know which specific channel you heard about us:")).toBe(false);
    expect(isEssay("Notice period?")).toBe(false);
  });

  it("skips profile fields a job board asks for, like title and company", () => {
    expect(isEssay("Current or Most Recent Title")).toBe(false);
    expect(isEssay("Current or Most Recent Company")).toBe(false);
    expect(isEssay("LinkedIn Profile URL (optional)")).toBe(false);
    expect(isEssay("Website or portfolio link, if you have one")).toBe(false);
    expect(isEssay("What is your preferred phone number?")).toBe(false);
    expect(isEssay("Describe your most recent project and what changed because of it.")).toBe(true);
  });
});

describe("textQuestions", () => {
  it("splits pasted text into questions and strips numbering", () => {
    expect(textQuestions("1. Why this role?\n\n2) Tell us about a hard call you made (100 words)\n- ok\n")).toEqual([
      { text: "Why this role?" },
      { text: "Tell us about a hard call you made (100 words)", word_limit: 100 },
    ]);
  });
});
