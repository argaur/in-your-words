import { askJson, Meter, MODELS } from "./llm";
import { judgeSentence } from "./judge";
import { LINE_SYSTEM, lineUser } from "./prompts";
import { LineOutputSchema, type Question, type Sentence, type StoryLine, type WebLine } from "./schema";

/**
 * v2 answer studio, one line at a time. "gap": the user answered the question under a flagged
 * line, and that answer is already in story_lines; Super rewrites the line from it. "recheck":
 * the user edited the line; Super only labels and cites it, the words stay theirs. Both are then
 * judged exactly like a drafted line.
 */
export async function fixLine(input: {
  mode: "gap" | "recheck";
  sentence: Pick<Sentence, "id" | "text" | "ask">;
  answer?: string;
  others: string[];
  question: Question;
  company: string;
  story_lines: StoryLine[];
  web_lines: WebLine[];
}): Promise<{ sentence: Sentence; usage: ReturnType<Meter["usage"]> }> {
  const meter = new Meter();
  const out = await askJson(
    LineOutputSchema,
    MODELS.judge,
    LINE_SYSTEM,
    lineUser({
      mode: input.mode,
      company: input.company,
      question: input.question.text,
      sentence: input.sentence.text,
      ask: input.sentence.ask,
      answer: input.answer,
      story: input.story_lines,
      web: input.web_lines,
    }),
    meter,
    2000,
    { thinking: false },
  );
  // A recheck never changes the user's words, whatever the model returned.
  const item = input.mode === "recheck" ? { ...out, text: input.sentence.text } : out;
  const sentence = await judgeSentence({
    id: input.sentence.id,
    item,
    others: input.others,
    question: input.question,
    company: input.company,
    story_lines: input.story_lines,
    web_lines: input.web_lines,
    meter,
  });
  return { sentence, usage: meter.usage() };
}
