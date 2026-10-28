# In Your Words

Job applications in your own words, with proof for every line.

You dictate your career stories once. For each role, the tool reads the company, drafts your screening answers and a short outreach note, and then checks every sentence against your stories. A line your stories cannot back is cut. You see why. A defend sheet lists each claim next to the words you actually said, so you are ready for the interview.

**Try it:** https://inyourwords.vercel.app. Press **Try the demo**, then **Log in as the demo user**. The demo account holds sample stories from Meera Iyer, a made-up person. **See a checked answer** opens a saved run that costs nothing to read.

## The problem
A strong senior application takes me 30 to 60 minutes. Plain AI drafts are fast, but they make up numbers and scope. Then I spend the saved time finding what is not true. So the slow part is not writing. It is trust.

In Your Words moves the work. The draft is fast, and the check is built in. Every kept sentence carries a label:
- **Spoken:** backed by a line in your stories.
- **Web:** backed by a page about the company.
- **Inference:** a fair link between the two, shown as such.

Anything else is cut, with the reason.

## How it works
1. **Story bank.** Your dictated stories are split into numbered lines. A small glossary fixes names that dictation mishears.
2. **Research.** Tavily reads the job posting and searches the company.
3. **Draft.** Nemotron 3 Ultra writes each answer. Each sentence states one kind of fact and names the lines it rests on.
4. **Judge.** Nemotron 3 Super checks every sentence against those lines and nearby story lines. It returns kept, cut or flagged, with a reason.
5. **Number check.** Plain code checks that every number in a kept sentence appears in its source. A model never gets the last word on a number.
6. **You decide.** Restore a cut line if you want it, and it stays flagged. You always send the answer yourself.

## How Nemotron and Token Factory are used
- Both models run on Nebius Token Factory, through its OpenAI-compatible API (`openai` SDK with a custom `baseURL`).
- **Nemotron 3 Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`) drafts. Thinking is off: with it on, the reasoning used the whole token budget before any answer.
- **Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`) judges. It runs once per answer, 4 at a time, at 2 to 9 seconds each.
- Each reply must parse against a zod schema. One retry, then a clear error. Never a partial result.
- A full package (2 answers and a note) costs about $0.02 of credit and takes about 20 seconds.

## How Flow is used
I built this voice first, with Wispr Flow.
- I dictated the idea and the first spec. Those notes became the product brief.
- I dictated my own story bank, the raw material the tool checks against. It took two sessions.
- I talked to my coding assistant through Flow: prompts, reviews and decisions.
- Flow mishears some names. That is why each story bank has a glossary file. The tool fixes the names before it reads a line.

Inside the product, the story box is built for dictation. You open it, press the Flow key and talk. Judges can do the same with their own stories in a live run.

## Run your own copy
You need Node 22, a Nebius Token Factory key and a Tavily key.

```bash
npm install
export NEBIUS_API_KEY=...   # Token Factory
export TAVILY_API_KEY=...
npm run engine -- --bank samples/meera --url <job posting link>
```

That runs the full check from the command line and saves the run to `runs/local/`. For the page flow, see [HOW_TO_USE.md](HOW_TO_USE.md). It also covers deploying your own copy with live runs.

Checks: `npm run check` (types, unit tests, event list, leak scan) and `npm run e2e` (browser tests at phone width, engine stubbed).

## Stack
Next.js 16 (App Router), TypeScript, Tailwind CSS 4 on Vercel. Nemotron on Nebius Token Factory. Tavily for research. Neon Postgres only for the daily live-run counter. PostHog for anonymous page events. No agent framework and no vector store.

## Data
- The public demo uses Meera Iyer, a made-up person (`samples/meera/`). Her employer is made up too. The Flexport posting in the saved run is real and public.
- Live runs send your text to Nebius and Tavily to run the check. It is stored nowhere.
- Live runs are capped at 3 per visitor and 20 in total per day.

## License
MIT. See [LICENSE](LICENSE).
