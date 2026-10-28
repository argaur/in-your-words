// Manual check: read questions from live postings. Free: no model call, no Tavily.
//   npx tsx scripts/intake-check.ts <posting url> [...]
import { fetchQuestions } from "../lib/intake";

for (const url of process.argv.slice(2)) {
  void fetchQuestions(url).then((r) => console.log(url, r.reason, JSON.stringify(r.questions)));
}
