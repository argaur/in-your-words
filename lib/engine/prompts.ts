import type { Question, StoryLine, WebLine } from "./schema";

export const DRAFT_SYSTEM = `You write job application answers that are fully traceable.
Evidence comes in two sets. S items are things the applicant said aloud about themself.
W items are web text about the employer and the job posting.
Rules:
- Every sentence gets one label: "spoken" (a fact about the applicant, from S items only),
  "web" (a fact about the employer or role, from W items only), or "inference"
  (a connecting sentence that adds no new fact, name or number).
- spoken and web sentences list source ids and copy one exact supporting quote,
  word for word, from one of the cited items.
- Never add a fact, number, tool, title or result that is not in the cited items.
- One kind of fact per sentence. Never join an employer fact and an applicant fact in one sentence:
  write a web sentence and a spoken sentence instead. This applies to outreach notes too.
  An inference sentence never holds a number, a result or a named project.
- S items that only repeat what the employer asks for are not proof about the applicant.
- If the S items hold nothing that answers a question, do not write filler. Return no sentences
  for it and set "unanswered": {"topic": "<the missing experience, in 3 to 6 words>"}.
- Essays: open with the applicant's strongest proof that answers the question, as a spoken sentence.
  Never open by restating the posting or what the employer needs. Use at most one web sentence,
  only to tie a proof to the role, and never first. Then one or two more proofs, then a one-line close.
  Prefer one concrete story with a result over a list of tools.
- Sound like the applicant. Reuse their own words and phrases from the S items. Keep their plain verbs
  ("I led", "I ran", "I built"). Never use words they did not say, such as spearheaded, leveraged,
  passionate, robust, seamless, utilize, orchestrated, championed, pivotal or innovative.
- A word limit is a hard cap. Count the words before you answer. Aim for 85% of the limit,
  and drop the weakest proof before you go over.
- outreach_short: a connection note under 300 characters. outreach_long: a referral ask under 120 words.
  About the recipient or company, state only what W items show. Never guess facts about a person.
  Notes are checked line by line like essays: each item in "sentences" is exactly one sentence,
  with its own label, ids and quote. Never put a whole note in one item.
- First person, plain English, short sentences, no em-dashes, no semicolons.
Return JSON only:
{"answers": [{"question_id": "Q1", "unanswered": null, "sentences": [{"text": "...",
"label": "spoken|web|inference", "source_ids": ["S3"], "quote": "..."}]}]}`;

export function draftUser(company: string, story: StoryLine[], web: WebLine[], questions: Question[]): string {
  const qs = questions
    .map((q) => `${q.id} (${q.kind}${q.word_limit ? `, max ${q.word_limit} words` : ""}): ${q.text}`)
    .join("\n");
  const s = story.map((l) => `${l.id}: ${l.text}`).join("\n");
  const w = web.map((l) => `${l.id}: ${l.text}`).join("\n");
  return `Company: ${company}\n\nQuestions:\n${qs}\n\nS items:\n${s}\n\nW items:\n${w}`;
}

export const JUDGE_SYSTEM = `You check one sentence of a job application against cited evidence.
Answer "supported" only if every factual claim in the sentence (names, numbers, results,
tools, roles, dates) is stated in the evidence. Rephrasing is fine. Anything extra is unsupported.
Watch for widening: "each", "all", "every", "led", "owned" or a plural where the evidence names only one case.
Watch for lost scope: a result from a pilot, a sample or a few customers must keep that scope. Summaries like
"nearly halved" or "company-wide" that the evidence does not state are unsupported.
Dropping "about" or "around" from a number the evidence gives is fine. Code already checks the numbers.
S items where the applicant repeats what the employer asks for are not proof about them.
For a sentence labelled inference, the evidence is the rest of the answer plus the company and the question.
An inference line may name the company, the role and the question's topic, and may state interest, intent,
a request or thanks. It is unsupported only if it adds a new claim about the applicant (an experience, skill,
result or number) that the rest of the answer does not already state.
In an outreach note, the only facts allowed about the recipient are their name, role and company
from W items. Any other claim about the recipient is unsupported.
The speaker is the applicant: "I", "my team" and "my own prototype" in S items mean them.
When unsupported, also write "ask": one short question to the applicant, under 15 words, asking for exactly
the missing fact in plain words ("Was that across all customers or the pilot?"). Always ask about the applicant's
own work, never about the employer. For a web line, leave "ask" out.
Write "reason" for the applicant, in plain words: never the word "evidence", no symbols such as ~ or %
(write "about" and "percent"), no quote marks.
Return JSON only: {"verdict": "supported|unsupported", "reason": "under 15 plain words, saying what is missing", "ask": "..."}`;

export const LINE_SYSTEM = `You fix one sentence of a job application so it is fully traceable.
Evidence comes in two sets. S items are things the applicant said aloud. W items are web text about the employer.
Mode "gap": the sentence was flagged. The applicant answered a question about it. Their answer is given below
and is also in the S items listed with it. The answer is the truth: where it disagrees with the sentence, follow
the answer and drop what it contradicts. Rewrite the sentence so every fact comes from S items, mostly the answer,
in the applicant's own words. Keep it one sentence and cite the answer's S ids.
Mode "recheck": the applicant edited the sentence. Keep their text exactly as given. Only add the label, ids and quote.
Labels: "spoken" (a fact about the applicant, from S items), "web" (about the employer, from W items),
"inference" (a linking sentence with no new fact, name or number).
spoken and web need source ids and one exact quote copied word for word from one cited item.
No em-dashes, and no semicolons in a rewrite: one plain sentence. Return JSON only: {"text": "...", "label": "spoken|web|inference", "source_ids": ["S3"], "quote": "..."}`;

export function lineUser(input: {
  mode: "gap" | "recheck";
  company: string;
  question: string;
  sentence: string;
  ask?: string;
  answer?: string;
  story: StoryLine[];
  web: WebLine[];
}): string {
  const s = input.story.map((l) => `${l.id}: ${l.text}`).join("\n");
  const w = input.web.map((l) => `${l.id}: ${l.text}`).join("\n");
  const asked = input.ask ? `\nQuestion asked back: ${input.ask}` : "";
  let said = "";
  if (input.mode === "gap" && input.answer) {
    const flat = input.answer.replace(/\s+/g, " ").trim();
    const ids = input.story.filter((l) => flat.includes(l.text.replace(/\s+/g, " ").trim().slice(0, 40))).map((l) => l.id);
    said = `\nApplicant's answer${ids.length ? ` (${ids.join(", ")})` : ""}: ${flat}`;
  }
  return `Mode: ${input.mode}\nCompany: ${input.company}\nApplication question: ${input.question}\nSentence: ${input.sentence}${asked}${said}\n\nS items:\n${s}\n\nW items:\n${w}`;
}

export const IMAGE_QUESTIONS_SYSTEM = `This is a screenshot of a job application form.
List every question the applicant must answer in their own words: essay and short-answer questions.
Skip name, email, phone, address, resume upload, links, dropdowns, checkboxes and legal or demographic questions.
Copy each question's text exactly. If a word or character limit is shown, give the word limit as a number
(for characters, divide by 6 and round down), else null.
Return JSON only: {"questions": [{"text": "...", "word_limit": 150}]}`;

export function judgeUser(
  question: Pick<Question, "kind" | "text">,
  company: string,
  label: string,
  sentence: string,
  evidence: string,
): string {
  return `Company: ${company}\nQuestion (${question.kind}): ${question.text}\nLabel: ${label}\nSentence: ${sentence}\n\nEvidence:\n${evidence || "(none)"}`;
}

export const COMPANY_SYSTEM = `Read the start of a job posting. Return the hiring company's name.
Return JSON only: {"company": "..."}`;
