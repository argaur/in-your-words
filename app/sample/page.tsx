import { SampleStudio } from "@/components/v2/studio";
import { RunSchema } from "@/lib/engine/schema";
import saved from "@/samples/meera/run.json";

// The saved sample run, read-only, in the same studio as the app (SPEC 3.14).
const run = RunSchema.parse(saved);

export default function Sample() {
  return <SampleStudio run={run} />;
}
