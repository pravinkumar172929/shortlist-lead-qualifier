import { BadRequest, handleInsight } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request) {
  try {
    return Response.json(await handleInsight(await req.json()));
  } catch (err) {
    const status = err instanceof BadRequest ? 400 : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Could not write insight" }, { status });
  }
}
