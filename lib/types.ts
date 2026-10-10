// Shared types used by the client, the API routes and the scoring engine.

/** A lead after column mapping and normalization, before any network work. */
export interface Lead {
  id: string;
  company: string;
  /** Bare registrable host, e.g. "acmeplumbing.com". Empty if unknown. */
  domain: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  industry: string;
  /** Employee count if the source gave one (ranges are collapsed to the midpoint). */
  employees: number | null;
  city: string;
  state: string;
  /** Original row values, kept so exports never lose a column the user had. */
  raw: Record<string, string>;
  /** How many input rows were merged into this lead by deduplication. */
  mergedFrom: number;
  /** True when the company name was guessed from the domain (replaced by the site title after enrichment). */
  companyInferred?: boolean;
}

export type EmailStatus = "valid" | "risky" | "invalid" | "missing";

export interface EmailCheck {
  status: EmailStatus;
  /** Human-readable reasons, e.g. "Role inbox (info@)". */
  notes: string[];
  hasMx: boolean | null;
}

export interface Socials {
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  x?: string;
}

/** What we learned from a company's public homepage. */
export interface Enrichment {
  domain: string;
  fetchedAt: string;
  reachable: boolean;
  /** Set when robots.txt disallows us; we then skip the page entirely. */
  robotsBlocked: boolean;
  https: boolean;
  finalUrl: string | null;
  title: string;
  description: string;
  tech: string[];
  /** Latest copyright year in the footer, a cheap proxy for "last touched". */
  copyrightYear: number | null;
  socials: Socials;
  emailsFound: string[];
  phonesFound: string[];
  hasCareersPage: boolean;
  hasEcommerce: boolean;
  hasBlog: boolean;
  hasChatWidget: boolean;
  hasAnalytics: boolean;
  error: string | null;
}

export interface IcpWeights {
  industry: number;
  size: number;
  decisionMaker: number;
  reachability: number;
  modernization: number;
  activity: number;
}

/** The ideal customer profile the user tunes in the sidebar. */
export interface Icp {
  industries: string[];
  minEmployees: number;
  maxEmployees: number;
  decisionMakerTitles: string[];
  weights: IcpWeights;
}

export type SignalKey = keyof IcpWeights;

export interface Signal {
  key: SignalKey;
  label: string;
  /** Points earned after weighting (0..max). */
  points: number;
  max: number;
  detail: string;
}

export type Tier = "hot" | "warm" | "cold" | "unreachable";

export interface ScoredLead extends Lead {
  emailCheck: EmailCheck;
  enrichment: Enrichment | null;
  score: number;
  tier: Tier;
  signals: Signal[];
}

export interface Insight {
  why: string;
  opener: string;
  source: "ai" | "rules";
}

/** Per-lead payload returned by /api/enrich. */
export interface EnrichResult {
  id: string;
  emailCheck: EmailCheck;
  enrichment: Enrichment | null;
}
