/**
 * What a visitor reads when a run step fails. Server messages name models and schema errors,
 * which mean nothing to a judge, so production shows plain text by code. Local mode keeps the
 * raw message for debugging.
 */
const PLAIN: Record<string, string> = {
  no_json: "The model's reply came back garbled. Try again. Earlier steps are saved.",
  tavily_failed: "The company search did not answer. Try again in a minute.",
  token_used: "This run has used its calls. Start the application again.",
  bad_token: "This run has expired. Start the application again.",
  do_not_send: "This company is on the do-not-send list. Nothing was sent.",
  config: "Live runs are not set up right now. The example application on your home page shows a full result.",
};

const FALLBACK = "Something went wrong on our side. Try again. Earlier steps are saved.";

export function stepMessage(code: string, message: string, local: boolean): string {
  if (local) return message;
  return PLAIN[code] ?? FALLBACK;
}
