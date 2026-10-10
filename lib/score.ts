// Fit scoring. Pure and synchronous so the browser can re-score every lead
// instantly when the user edits the ideal customer profile.
//
// Six signals, each scored 0..1 and multiplied by its weight. Default weights
// sum to 100, so the score reads as a percentage. Every signal carries a
// plain-English `detail` so a rep can see why a lead ranks where it does.

import type { EmailCheck, Enrichment, Icp, Lead, ScoredLead, Signal, SignalKey, Tier } from "./types";

export const DEFAULT_ICP: Icp = {
  industries: ["hvac", "plumbing", "manufacturing", "logistics", "construction", "landscaping", "dental", "accounting", "insurance", "distribution"],
  minEmployees: 10,
  maxEmployees: 200,
  decisionMakerTitles: ["owner", "founder", "ceo", "president", "principal", "managing director", "partner"],
  weights: { industry: 20, size: 15, decisionMaker: 20, reachability: 20, modernization: 15, activity: 10 },
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  industry: "Industry fit",
  size: "Company size",
  decisionMaker: "Decision maker",
  reachability: "Reachability",
  modernization: "Modernization gap",
  activity: "Business activity",
};

const SENIOR = /\b(vp|vice president|director|head of|gm|general manager|coo|cfo|cto|cmo|chief)\b/i;

interface Part {
  ratio: number;
  detail: string;
}

function industryFit(lead: Lead, e: Enrichment | null, icp: Icp): Part {
  if (icp.industries.length === 0) return { ratio: 1, detail: "No industry filter set" };
  const haystack = `${lead.industry} ${lead.company} ${e?.title ?? ""} ${e?.description ?? ""}`.toLowerCase();
  const hit = icp.industries.find((k) => k.trim() && haystack.includes(k.trim().toLowerCase()));
  if (hit && lead.industry.toLowerCase().includes(hit.toLowerCase())) return { ratio: 1, detail: `Listed industry matches “${hit}”` };
  if (hit) return { ratio: 0.75, detail: `Website mentions “${hit}”` };
  if (!lead.industry && !e?.reachable) return { ratio: 0.3, detail: "Industry unknown" };
  return { ratio: 0, detail: lead.industry ? `${lead.industry} is outside your target industries` : "No target industry found on the site" };
}

function sizeFit(lead: Lead, icp: Icp): Part {
  const n = lead.employees;
  if (n === null) return { ratio: 0.4, detail: "Headcount unknown" };
  if (n >= icp.minEmployees && n <= icp.maxEmployees) return { ratio: 1, detail: `${n} employees, inside ${icp.minEmployees}–${icp.maxEmployees}` };
  const near = n >= icp.minEmployees * 0.5 && n <= icp.maxEmployees * 1.5;
  return near
    ? { ratio: 0.5, detail: `${n} employees, just outside ${icp.minEmployees}–${icp.maxEmployees}` }
    : { ratio: 0, detail: `${n} employees, outside ${icp.minEmployees}–${icp.maxEmployees}` };
}

function decisionMaker(lead: Lead, icp: Icp): Part {
  const t = lead.title.toLowerCase();
  if (!t) return { ratio: 0.1, detail: "No job title on file" };
  const hit = icp.decisionMakerTitles.find((k) => k.trim() && new RegExp(`\\b${k.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
  if (hit) return { ratio: 1, detail: `${lead.title} can sign off` };
  if (SENIOR.test(t)) return { ratio: 0.55, detail: `${lead.title} is senior but may not decide alone` };
  return { ratio: 0.15, detail: `${lead.title} is unlikely to own the decision` };
}

function reachability(lead: Lead, email: EmailCheck, e: Enrichment | null): Part {
  let r = 0;
  const bits: string[] = [];
  if (email.status === "valid") {
    r += 0.6;
    bits.push("verified email");
  } else if (email.status === "risky") {
    r += 0.3;
    bits.push("risky email");
  } else if (e?.emailsFound.length) {
    r += 0.2;
    bits.push("email found on site");
  }
  if (lead.phone || e?.phonesFound.length) {
    r += 0.2;
    bits.push("phone");
  }
  if (e?.socials.linkedin) {
    r += 0.2;
    bits.push("LinkedIn");
  }
  return { ratio: Math.min(1, r), detail: bits.length ? `Has ${bits.join(", ")}` : "No working contact channel" };
}

/**
 * Caprae's thesis is value creation after acquisition, much of it by bringing
 * AI and modern tooling to traditional businesses. So an outdated web presence
 * is an opportunity, not a red flag.
 */
function modernization(e: Enrichment | null, now: number): Part {
  if (!e || !e.reachable) return { ratio: 0.3, detail: "Website could not be checked" };
  let r = 0;
  const gaps: string[] = [];
  if (e.copyrightYear !== null && now - e.copyrightYear >= 3) {
    r += 0.35;
    gaps.push(`site last updated ~${e.copyrightYear}`);
  }
  if (!e.hasAnalytics) {
    r += 0.25;
    gaps.push("no analytics");
  }
  if (!e.tech.some((t) => ["HubSpot", "Salesforce", "Mailchimp"].includes(t))) {
    r += 0.2;
    gaps.push("no CRM or email marketing");
  }
  if (!e.hasChatWidget) {
    r += 0.1;
    gaps.push("no live chat");
  }
  if (!e.https) {
    r += 0.1;
    gaps.push("no HTTPS");
  }
  return { ratio: Math.min(1, r), detail: gaps.length ? `Room to modernize: ${gaps.join(", ")}` : "Already well tooled" };
}

function activity(e: Enrichment | null): Part {
  if (!e || !e.reachable) return { ratio: 0, detail: "No live website" };
  let r = 0.4;
  const bits = ["live website"];
  if (e.hasCareersPage) {
    r += 0.3;
    bits.push("hiring");
  }
  if (e.hasBlog || e.socials.facebook || e.socials.instagram || e.socials.x) {
    r += 0.2;
    bits.push("active online");
  }
  if (e.hasEcommerce) {
    r += 0.1;
    bits.push("sells online");
  }
  return { ratio: Math.min(1, r), detail: bits.join(", ") };
}

/** Hot = worth a call this week. Warm = nurture. Cold = park. */
export const TIER_THRESHOLDS = { hot: 85, warm: 60 } as const;

export function tierFor(score: number, email: EmailCheck, e: Enrichment | null, lead: Lead): Tier {
  const noChannel = email.status === "invalid" || email.status === "missing";
  if (noChannel && !lead.phone && !(e?.reachable)) return "unreachable";
  if (score >= TIER_THRESHOLDS.hot) return "hot";
  if (score >= TIER_THRESHOLDS.warm) return "warm";
  return "cold";
}

export function scoreLead(lead: Lead, email: EmailCheck, e: Enrichment | null, icp: Icp, now = new Date().getFullYear()): ScoredLead {
  const parts: Record<SignalKey, Part> = {
    industry: industryFit(lead, e, icp),
    size: sizeFit(lead, icp),
    decisionMaker: decisionMaker(lead, icp),
    reachability: reachability(lead, email, e),
    modernization: modernization(e, now),
    activity: activity(e),
  };
  const totalWeight = Object.values(icp.weights).reduce((a, b) => a + b, 0) || 1;
  const signals: Signal[] = (Object.keys(parts) as SignalKey[]).map((key) => {
    // Normalise so the score stays out of 100 even if weights don't sum to 100.
    const max = (icp.weights[key] / totalWeight) * 100;
    return { key, label: SIGNAL_LABELS[key], max, points: parts[key].ratio * max, detail: parts[key].detail };
  });
  const score = Math.round(signals.reduce((a, s) => a + s.points, 0));
  return { ...lead, emailCheck: email, enrichment: e, signals, score, tier: tierFor(score, email, e, lead) };
}
