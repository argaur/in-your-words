import { LandingV2 } from "@/components/v2/landing";
import { RunSchema } from "@/lib/engine/schema";
import saved from "@/samples/meera/run.json";

// Parsed at build time: a replay file that no longer matches the Run schema fails the build.
const run = RunSchema.parse(saved);

export default function Home() {
  return <LandingV2 saved={run} />;
}
