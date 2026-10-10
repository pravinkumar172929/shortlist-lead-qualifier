// Rule-based "why this lead" and outreach opener. Used directly when no AI key
// is configured, and as the fallback when the AI call fails. Runs anywhere.

import type { Insight, ScoredLead } from "./types";

export function rulesInsight(l: ScoredLead): Insight {
  const ratio = (s: { points: number; max: number }) => (s.max ? s.points / s.max : 0);
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const fit = l.signals.filter((s) => s.key !== "modernization");
  const strongest = [...fit].sort((a, b) => ratio(b) - ratio(a)).slice(0, 2).filter((s) => ratio(s) >= 0.5);
  const weakest = [...fit].sort((a, b) => ratio(a) - ratio(b))[0];
  const gap = l.signals.find((s) => s.key === "modernization");

  const parts: string[] = [];
  parts.push(strongest.length ? `Fits on ${strongest.map((s) => lower(s.detail)).join(" and ")}.` : "Few fit signals so far.");
  if (gap && ratio(gap) >= 0.5) parts.push(`${gap.detail}, the kind of upside an owner-operator can unlock.`);
  if (weakest && ratio(weakest) < 0.5) parts.push(`Gap: ${lower(weakest.detail)}.`);
  const why = parts.join(" ");

  const name = l.firstName || "there";
  const e = l.enrichment;
  let hook: string;
  if (e?.copyrightYear && new Date().getFullYear() - e.copyrightYear >= 3) {
    hook = `I was looking at ${l.company}'s website and noticed it hasn't changed much since ${e.copyrightYear}, which usually means the team is busy running the business rather than marketing it.`;
  } else if (e?.hasCareersPage) {
    hook = `I saw ${l.company} is hiring, which usually means demand is outrunning capacity.`;
  } else if (l.industry) {
    hook = `I've been speaking with owners of ${l.industry.toLowerCase()} businesses${l.state ? ` in ${l.state}` : ""} about what comes next for the company they've built.`;
  } else {
    hook = `I came across ${l.company} and was impressed by what you've built.`;
  }
  const opener = `Hi ${name}, ${hook} Would you be open to a 15-minute call about where you'd like to take ${l.company} over the next few years?`;
  return { why, opener, source: "rules" };
}
