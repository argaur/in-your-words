# How to use In Your Words

One section per build step. Plain steps, no setup you do not need.

## Run the engine from the command line
This runs the whole check (research, draft, judge) on a story bank and one job posting, with no web page.

1. Install once: `npm install`
2. Keys: set `NEBIUS_API_KEY` and `TAVILY_API_KEY` in your shell. On Gaurav's machine the script reads them from gopass by itself.
3. Run: `npx tsx scripts/engine.ts --bank samples/meera --url <job posting link>`
4. It prints each step with its time and cost, then writes the full run to `runs/local/<run_id>.json`. That folder never goes into git.

The sample bank `samples/meera/` is a made-up person, so it is safe to share. To use your own stories, put a `bank.md` and a `glossary.json` in a folder and pass it with `--bank`.
A typical run takes about 30 seconds and about $0.02 of Token Factory credit, plus 2 Tavily credits.

## Run your own package locally
This is the full page flow on your own machine: your stories, a real posting, the checked answers, and a saved run log.

1. Start it: `npm run local`. It reads the two keys from gopass into that one process and turns on local mode. Then open http://localhost:3000/run
2. Story bank: press **Load stories/bank.md** for your own bank, or dictate with Wispr Flow into the box, or open a file. You see how many story lines it found.
3. The role: paste the posting link and each question from the form, with its word limit. A short outreach note is added unless you untick it.
4. Press **Check my answers**. Three steps run, about 20 seconds. If a step fails, **Try step N again** reruns only that step.
5. Proof view: pick Q1, Q2 or Note at the top. **Check** shows every line with its proof or its cut reason. Tap a tag to see your own words. Mark each line True or False. **Restore** brings a cut line back, flagged as not backed.
6. **Paste** shows the answer as it goes into the form. **Copy answer** copies plain text only. **Defend sheet** lists every kept claim with your words, ready to print.
7. Every change is saved to `runs/local/<run_id>.json`. The path shows next to Copy answer. That folder never goes into git.

Companies you must not draft for go in `config/do-not-send.local.json` (git ignores it). The run stops before any outside call if the posting matches.

## For judges: the saved run
Open https://inyourwords.vercel.app and press **See a checked answer**. No sign-in.

1. The saved run is the full package: two screening answers and a short outreach note.
2. Every sentence shows its proof, or the reason it was cut. Tap a tag to open her words.
3. **Defend sheet** lists every kept claim with her words, for interview prep.

Meera Iyer and FleetGrid are made up. The Flexport posting is real and public. The saved run came from a real run of the engine on 26 Oct 2026, so it costs nothing to read.

## Checks before a commit
- `npm run check`: types, unit tests, the event list and the leak scan. The leak scan compares every file that deploys with your real story lines and `config/leak-names.local.json`. Add your employers and anyone named in your stories to that file.
- `npm run e2e`: browser smoke tests on a production build, at phone width and in dark mode. The engine is stubbed, so it costs nothing.

## Measure yourself
These only show in a local run (`npm run local`). They feed the PRD's H2 time target and the self-grading check.

**Blind marks.** A new run opens on "Mark without labels". You see only the kept lines, with no tags, IDs or cuts. Mark each one True or False. Press **Show labels** when done. Marks made here are saved with `marked_blind: true`, so blind and labelled accuracy can be compared.

**Timer.** The proof view shows `editing mm:ss`. It counts only active time: it pauses when the tab is hidden, and 5 minutes after your last click, key or scroll. Each **Copy answer** saves the current time to the run as `timer_active_seconds`.

**Baseline.** On the story bank screen, press **Baseline mode**. Paste a plain draft from Claude or ChatGPT, press **Start timer**, fix it the way you normally would, then press **Done**. Only the time is saved, as a run with mode `baseline`. The draft text is not kept.

## Try it live
On https://inyourwords.vercel.app press **Try the demo**, then **Log in as the demo user**. The demo account already holds Meera's stories.

1. Press **New application**. Paste a job posting link, or paste the questions, one per line.
2. The tool reads the company, drafts each answer and checks every line.
3. A line marked **Needs your words** asks you one question. Press **Answer by voice** and talk, or type. Your answer rewrites the line.
4. **Defend sheet** lists every kept claim with the words behind it.

Live runs are capped at 3 per visitor and 20 in total per day. They reset at midnight UTC. When the cap is used up, you see a note and a link back to the saved run. Your text is sent to Nebius and Tavily to run the draft, and stored nowhere.

## Run your own copy
This puts your own copy online, with live runs and the daily credit check.

1. Fork the repo and import it into Vercel. Every route runs on Node.
2. Make a free Neon Postgres database. The tables create themselves on first use.
3. Add these environment variables in Vercel:
   - `NEBIUS_API_KEY` and `TAVILY_API_KEY`: your two engine keys.
   - `DATABASE_URL`: the Neon connection string.
   - `RUN_TOKEN_SECRET` and `CRON_SECRET`: two long random strings, for example from `openssl rand -base64 32`.
   - `LIVE_RUNS_ENABLED=1` once you want live runs on. Without it, the site shows only the saved run.
4. Deploy. Open `/api/health`. It should report `db: ok`.
5. Set your starting Token Factory balance in `lib/credit.ts` (`CREDIT.startUsd` and `CREDIT.startDay`).

**Daily credit check.** `vercel.json` calls `/api/cron/credit-check` once a day at 03:00 UTC. It reads your Tavily balance, makes one 1-token call to Token Factory, and estimates the Token Factory balance from the number of live runs. It sends a `credit_check_ran` event to PostHog with `all_ok`. Set a PostHog alert on that event to get an email when `all_ok` is false, or when no event arrives in a day.

To run the check by hand: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-site>/api/cron/credit-check`
