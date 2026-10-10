// AI-written insight via the Anthropic Messages API (plain fetch, no SDK).
// Only the extracted signals are sent, never the raw HTML, which keeps each
// call small, cheap and fast. Falls back to rules if anything goes wrong.

import type { Insight, ScoredLead } from "../types";
import { rulesInsight } from "../insights";
import { cacheGet, cacheSet } from "./cache";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function aiInsight(l: ScoredLead): Promise<Insight> {
  if (!aiEnabled()) return rulesInsight(l);

  const cacheKey = `insight:${l.domain}:${l.email}:${l.score}`;
  const cached = await cacheGet<Insight>(cacheKey);
  if (cached) return cached;

  const facts = {
    company: l.company,
    contact: `${l.firstName} ${l.lastName}`.trim(),
    title: l.title,
    industry: l.industry,
    employees: l.employees,
    location: [l.city, l.state].filter(Boolean).join(", "),
    fitScore: l.score,
    signals: l.signals.map((s) => `${s.label}: ${s.detail}`),
    website: l.enrichment && {
      title: l.enrichment.title,
      description: l.enrichment.description,
      tech: l.enrichment.tech,
      copyrightYear: l.enrichment.copyrightYear,
      hiring: l.enrichment.hasCareersPage,
    },
  };

  const prompt = `You help a private equity firm that buys and grows established small businesses (and brings AI and modern tooling to them after acquisition) prioritise outreach to business owners.

Lead facts (JSON):
${JSON.stringify(facts, null, 2)}

Return only JSON with two string fields:
"why": one or two sentences on why this lead is or isn't worth a call this week, citing the facts.
"opener": a first line for a cold email to the contact, under 45 words, specific to a fact above, warm and plain, no flattery, no mention of AI or scores.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = data.content.find((c) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { why?: string; opener?: string };
    if (!json.why || !json.opener) throw new Error("Incomplete AI response");
    const insight: Insight = { why: json.why.trim(), opener: json.opener.trim(), source: "ai" };
    await cacheSet(cacheKey, insight, 7);
    return insight;
  } catch {
    return rulesInsight(l);
  }
}
