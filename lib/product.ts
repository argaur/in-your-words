/** v2 product copy that more than one screen reads: use cases, interview questions, coming-soon pages. */

export type UseCase = { slug: string; name: string; line: string; live: boolean };

export const USE_CASES: UseCase[] = [
  { slug: "jobs", name: "Job applications", line: "Screening answers and a note to the hiring manager, from what you said.", live: true },
  { slug: "interview", name: "Interview prep", line: "Say each claim back out loud before the interview.", live: false },
  { slug: "proposals", name: "Freelance proposals", line: "Proposals that only promise what you have done.", live: false },
  { slug: "posts", name: "LinkedIn posts", line: "Posts from your voice notes, in your words.", live: false },
  { slug: "reviews", name: "Self-reviews", line: "Appraisal write-ups backed by what you actually did.", live: false },
  { slug: "grants", name: "Grant and hackathon applications", line: "Long forms answered from your own stories.", live: false },
  { slug: "bios", name: "Bios", line: "Speaker bios, About sections and case study intros.", live: false },
];

/** The short voice interview that starts a story bank (PRODUCT_V2.md section 6). */
export const INTERVIEW = [
  { q: "What do you do now, and what did you do before?", hint: "Your role, the company, how long. Then the job before." },
  { q: "Tell me about the work you are proudest of. What changed because of you?", hint: "Say what you did yourself, not the team. Give a number if you have one." },
  { q: "Tell me about something that went wrong. How did you find out, and what did you change?", hint: "The failure, how you caught it, and what happened after." },
  { q: "What have you built or shipped yourself in the last year?", hint: "Name it, say what it does, and who used it." },
  { q: "What kind of work do you want next, and why?", hint: "The role, the kind of team, and the reason." },
];

export type SoonPage = { slug: string; name: string; what: string; how: string[] };

export const SOON: SoonPage[] = [
  {
    slug: "ledger",
    name: "Claim ledger",
    what: "One list of every fact and number you have stated, across every application.",
    how: ["Change a number once and every draft updates.", "See which claims you use most.", "Spot a story you have never used."],
  },
  {
    slug: "same-story",
    name: "Same story everywhere",
    what: "A check that you tell each story the same way in every application.",
    how: ["Flags a number that drifts, like 40% in one answer and nearly half in another.", "Shows the words you said, so you pick the true one."],
  },
  {
    slug: "rehearse",
    name: "Say it back",
    what: "Speak your answer out loud before the interview. Any claim you cannot say without reading gets flagged.",
    how: ["Read nothing. Just speak.", "See which claims you dropped or changed.", "Practise the follow-up question for each claim."],
  },
  {
    slug: "memo",
    name: "Voice memo inbox",
    what: "Speak a story any time, like right after a meeting. It is split into facts and added to your story bank.",
    how: ["One tap, then talk.", "Every memo becomes proof for later drafts."],
  },
  {
    slug: "style",
    name: "Your voice style",
    what: "Learns how you speak from your own answers: sentence length, words you use, how you open a story.",
    how: ["Drafts start the way you start.", "A said-by-you meter on every answer.", "Your own list of words to never use."],
  },
  ...USE_CASES.filter((u) => !u.live).map((u) => ({
    slug: u.slug,
    name: u.name,
    what: u.line,
    how: ["Uses the same story bank you built for job applications.", "Every sentence traces back to something you said.", "Anything you never said gets a question, not a guess."],
  })),
];
