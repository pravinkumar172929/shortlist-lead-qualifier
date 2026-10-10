// Framework-agnostic request handlers. The Next.js route files are thin
// wrappers around these, which keeps the logic testable without Next.

import type { EnrichResult, Insight, ScoredLead } from "../types";
import { normalizeDomain, normalizeEmail } from "../normalize";
import { mapLimit } from "../concurrency";
import { checkEmail } from "./emailCheck";
import { enrichDomain } from "./enrich";
import { aiEnabled, aiInsight } from "./aiInsight";
import { cacheBackend } from "./cache";

/** Keep each request small so it finishes well inside a serverless timeout. */
export const MAX_BATCH = 8;

export class BadRequest extends Error {}

export async function handleEnrich(body: unknown): Promise<{ results: EnrichResult[] }> {
  const leads = (body as { leads?: unknown })?.leads;
  if (!Array.isArray(leads) || leads.length === 0) throw new BadRequest("Send { leads: [{ id, domain, email }] }");
  if (leads.length > MAX_BATCH) throw new BadRequest(`At most ${MAX_BATCH} leads per request`);

  const clean = leads.map((l) => {
    const x = l as Record<string, unknown>;
    return { id: String(x.id ?? ""), domain: normalizeDomain(String(x.domain ?? "")), email: normalizeEmail(String(x.email ?? "")) };
  });

  // Leads from the same company share one homepage fetch.
  const domains = [...new Set(clean.map((l) => l.domain).filter(Boolean))];
  const sites = new Map(await mapLimit(domains, 4, async (d) => [d, await enrichDomain(d)] as const));

  const results = await mapLimit(clean, 4, async (l) => ({
    id: l.id,
    emailCheck: await checkEmail(l.email, l.domain),
    enrichment: l.domain ? sites.get(l.domain) ?? null : null,
  }));
  return { results };
}

export async function handleInsight(body: unknown): Promise<Insight> {
  const lead = (body as { lead?: ScoredLead })?.lead;
  if (!lead || typeof lead !== "object" || !Array.isArray(lead.signals)) throw new BadRequest("Send { lead } as returned by scoring");
  return aiInsight(lead);
}

export function handleHealth() {
  return { cache: cacheBackend(), ai: aiEnabled() };
}
