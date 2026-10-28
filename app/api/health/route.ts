import { checkDb } from "@/lib/db";
import { buildHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = buildHealth(await checkDb());
  return Response.json({ data: health, error: null }, { status: 200 });
}
