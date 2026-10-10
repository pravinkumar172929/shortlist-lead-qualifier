import { BadRequest, handleEnrich } from "@/lib/server/handlers";

export const runtime = "nodejs"; // needs node:dns for MX lookups
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    return Response.json(await handleEnrich(await req.json()));
  } catch (err) {
    const status = err instanceof BadRequest ? 400 : 500;
    return Response.json({ error: err instanceof Error ? err.message : "Enrichment failed" }, { status });
  }
}
