import type { Insight, ScoredLead } from "./types";
import { toCsv } from "./csv";

const TIER_LABEL = { hot: "Hot", warm: "Warm", cold: "Cold", unreachable: "Unreachable" } as const;

/** Everything we know, one row per lead, including the user's original columns. */
export function fullCsv(leads: ScoredLead[], insights: Record<string, Insight>): string {
  const originalCols = [...new Set(leads.flatMap((l) => Object.keys(l.raw)))];
  const headers = [
    "Fit score", "Tier", "Company", "Domain", "First name", "Last name", "Title", "Email", "Email status", "Email notes",
    "Phone", "Industry", "Employees", "City", "State", "LinkedIn", "Tech", "Site last updated", "Hiring",
    "Why this lead", "Suggested opener", "Rows merged",
    ...originalCols.map((c) => `Original: ${c}`),
  ];
  const rows = leads.map((l) => {
    const e = l.enrichment;
    const ins = insights[l.id];
    const row: Record<string, unknown> = {
      "Fit score": l.score,
      Tier: TIER_LABEL[l.tier],
      Company: l.company,
      Domain: l.domain,
      "First name": l.firstName,
      "Last name": l.lastName,
      Title: l.title,
      Email: l.email,
      "Email status": l.emailCheck.status,
      "Email notes": l.emailCheck.notes.join("; "),
      Phone: l.phone || e?.phonesFound[0] || "",
      Industry: l.industry,
      Employees: l.employees ?? "",
      City: l.city,
      State: l.state,
      LinkedIn: e?.socials.linkedin ?? "",
      Tech: e?.tech.join("; ") ?? "",
      "Site last updated": e?.copyrightYear ?? "",
      Hiring: e?.hasCareersPage ? "Yes" : "",
      "Why this lead": ins?.why ?? "",
      "Suggested opener": ins?.opener ?? "",
      "Rows merged": l.mergedFrom,
    };
    for (const c of originalCols) row[`Original: ${c}`] = l.raw[c] ?? "";
    return row;
  });
  return toCsv(headers, rows);
}

/** Column names HubSpot's contact importer maps automatically. */
export function hubspotCsv(leads: ScoredLead[], insights: Record<string, Insight>): string {
  const headers = ["First Name", "Last Name", "Email", "Phone Number", "Job Title", "Company Name", "Website URL", "Industry", "City", "State/Region", "Lead Status", "Fit Score", "Notes"];
  const rows = leads
    .filter((l) => l.tier !== "unreachable" && l.emailCheck.status !== "invalid")
    .map((l) => ({
      "First Name": l.firstName,
      "Last Name": l.lastName,
      Email: l.email,
      "Phone Number": l.phone || l.enrichment?.phonesFound[0] || "",
      "Job Title": l.title,
      "Company Name": l.company,
      "Website URL": l.domain ? `https://${l.domain}` : "",
      Industry: l.industry,
      City: l.city,
      "State/Region": l.state,
      "Lead Status": l.tier === "hot" ? "OPEN" : "NEW",
      "Fit Score": l.score,
      Notes: [insights[l.id]?.why, insights[l.id]?.opener].filter(Boolean).join("\n\n"),
    }));
  return toCsv(headers, rows);
}
