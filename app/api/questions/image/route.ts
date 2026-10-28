import { askJson, Meter, MODELS } from "@/lib/engine/llm";
import { IMAGE_QUESTIONS_SYSTEM } from "@/lib/engine/prompts";
import { FoundQuestionsSchema } from "@/lib/engine/schema";
import { fail, fromError, ok } from "@/lib/api";
import { guard, ImageBody, reserveImage } from "@/lib/routes";

export const runtime = "nodejs";
export const maxDuration = 60;

/** v2: read form questions from a screenshot with Nemotron VL. The image is never stored. */
export async function POST(req: Request) {
  const blocked = guard(req, false);
  if (blocked) return blocked;
  const body = ImageBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("bad_request", "Send a PNG, JPEG or WebP screenshot under 3 MB", 400);
  try {
    const capped = await reserveImage(req);
    if (capped) return capped;
    const meter = new Meter();
    const out = await askJson(
      FoundQuestionsSchema,
      MODELS.vision,
      IMAGE_QUESTIONS_SYSTEM,
      [
        { type: "text", text: "Read the questions from this application form." },
        { type: "image_url", image_url: { url: body.data.image } },
      ],
      meter,
      1500,
      { thinking: false },
    );
    const questions = out.questions.map((q) => (q.word_limit ? { text: q.text, word_limit: q.word_limit } : { text: q.text }));
    return ok({ questions, usage: meter.usage() });
  } catch (err) {
    return fromError(err);
  }
}
