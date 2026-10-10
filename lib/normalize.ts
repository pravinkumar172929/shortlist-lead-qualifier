// Turns arbitrary CSV rows into clean Lead objects and removes duplicates.

import type { Lead } from "./types";

/** Field -> header aliases we recognise (compared after lowercasing and stripping punctuation). */
const ALIASES: Record<string, string[]> = {
  company: ["company", "companyname", "organization", "organisation", "business", "businessname", "account", "accountname", "name"],
  website: ["website", "domain", "url", "companywebsite", "companydomain", "site", "web", "homepage"],
  firstName: ["firstname", "first", "givenname", "contactfirstname"],
  lastName: ["lastname", "last", "surname", "familyname", "contactlastname"],
  fullName: ["fullname", "contactname", "contact", "person", "ownername"],
  title: ["title", "jobtitle", "position", "role", "designation"],
  email: ["email", "emailaddress", "workemail", "contactemail", "mail"],
  phone: ["phone", "phonenumber", "telephone", "tel", "mobile", "companyphone", "directphone"],
  industry: ["industry", "sector", "vertical", "category", "naics", "sic"],
  employees: ["employees", "employeecount", "headcount", "companysize", "size", "numberofemployees", "staff"],
  city: ["city", "town", "locality"],
  state: ["state", "region", "province", "stateregion"],
};

export type ColumnMap = Partial<Record<keyof typeof ALIASES, string>>;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Guess which CSV header holds which field. Exact alias matches win over partial ones. */
export function detectColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<string>();
  const fields = Object.keys(ALIASES) as Array<keyof typeof ALIASES>;

  for (const pass of ["exact", "partial"] as const) {
    for (const field of fields) {
      if (map[field]) continue;
      const hit = headers.find((h) => {
        if (used.has(h)) return false;
        const k = squash(h);
        return ALIASES[field].some((a) => (pass === "exact" ? k === a : k.includes(a) && a.length > 3));
      });
      if (hit) {
        map[field] = hit;
        used.add(hit);
      }
    }
  }
  return map;
}

const MULTI_PART_TLDS = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.in", "co.nz", "com.br", "co.za", "com.mx"]);

/** "https://www.Acme.com/about?x=1" -> "acme.com". Returns "" for anything unusable. */
export function normalizeDomain(input: string): string {
  let s = (input || "").trim().toLowerCase();
  if (!s) return "";
  if (s.includes("@") && !s.includes("/")) s = s.split("@").pop() || "";
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\d?\./, "");
  s = s.split(/[/?#:\s]/)[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return "";
  // Collapse subdomains like shop.acme.com to acme.com.
  const parts = s.split(".");
  const lastTwo = parts.slice(-2).join(".");
  const keep = MULTI_PART_TLDS.has(lastTwo) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

export function normalizeEmail(input: string): string {
  const s = (input || "").trim().toLowerCase().replace(/^mailto:/, "");
  return s;
}

/** Keeps the phone as written (reps dial what they read) but drops junk values. */
export function normalizePhone(input: string): string {
  const s = (input || "").trim();
  return s.replace(/\D/g, "").length >= 7 ? s : "";
}

/** "11-50" -> 30, "1,200" -> 1200, "50+" -> 50. */
export function parseEmployees(input: string): number | null {
  const s = (input || "").replace(/,/g, "");
  const nums = s.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length === 0) return null;
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2);
  return nums[0];
}

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "proton.me", "protonmail.com", "live.com", "msn.com", "ymail.com"]);
export const isFreeMailDomain = (d: string) => FREE_MAIL.has(d);

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

export function rowToLead(row: Record<string, string>, map: ColumnMap, index: number): Lead {
  const get = (f: keyof ColumnMap) => (map[f] ? (row[map[f] as string] ?? "").trim() : "");
  const email = normalizeEmail(get("email"));
  const emailDomain = email.includes("@") ? email.split("@")[1] : "";

  let domain = normalizeDomain(get("website"));
  // Fall back to the email's domain when no website was given (but never a Gmail-style one).
  if (!domain && emailDomain && !isFreeMailDomain(emailDomain)) domain = normalizeDomain(emailDomain);

  let firstName = get("firstName");
  let lastName = get("lastName");
  const full = get("fullName");
  if (!firstName && !lastName && full) {
    const parts = full.split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  let company = get("company");
  const companyInferred = !company && Boolean(domain);
  if (companyInferred) company = titleCase(domain.split(".")[0].replace(/[-_]/g, " "));

  return {
    id: `l${index}`,
    company,
    domain,
    firstName: titleCase(firstName.toLowerCase()),
    lastName: titleCase(lastName.toLowerCase()),
    title: get("title"),
    email,
    phone: normalizePhone(get("phone")),
    industry: get("industry"),
    employees: parseEmployees(get("employees")),
    city: get("city"),
    state: get("state"),
    raw: row,
    mergedFrom: 1,
    companyInferred,
  };
}

/** How complete a lead is; used to pick which duplicate survives. */
function completeness(l: Lead): number {
  return [l.company, l.domain, l.firstName, l.lastName, l.title, l.email, l.phone, l.industry, l.city, l.state].filter(Boolean).length + (l.employees ? 1 : 0);
}

/**
 * Removes duplicates. Two rows are the same lead when they share an email, or
 * name the same person at the same domain, or are both person-less rows for the
 * same domain. Matching is transitive (union-find). The most complete row wins
 * and its blanks are filled from the rows merged into it.
 */
/** "Ridgeway Heating & Air | HVAC Repair" -> "Ridgeway Heating & Air". */
export function companyFromTitle(title: string): string {
  return title.split(/\s[|–—-]\s|\s[|–—]|[|–—]\s/)[0].trim().slice(0, 80);
}

export function dedupe(leads: Lead[]): { leads: Lead[]; removed: number; dropped: number } {
  const usable = leads.filter((l) => l.domain || l.email);
  const dropped = leads.length - usable.length;

  const parent = usable.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByKey = new Map<string, number>();

  usable.forEach((l, i) => {
    const person = `${l.firstName} ${l.lastName}`.trim().toLowerCase();
    const keys: string[] = [];
    if (l.email) keys.push(`e:${l.email}`);
    if (l.domain && person) keys.push(`p:${l.domain}|${person}`);
    if (l.domain && !person && !l.email) keys.push(`d:${l.domain}`);
    for (const k of keys) {
      const j = firstByKey.get(k);
      if (j === undefined) firstByKey.set(k, i);
      else parent[find(i)] = find(j);
    }
  });

  const groups = new Map<number, Lead[]>();
  usable.forEach((l, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), l]);
  });

  const out: Lead[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => completeness(b) - completeness(a));
    const best = { ...sorted[0] };
    for (const other of sorted.slice(1)) {
      for (const f of ["company", "domain", "firstName", "lastName", "title", "email", "phone", "industry", "city", "state"] as const) {
        if (!best[f] && other[f]) best[f] = other[f];
      }
      if (best.employees === null && other.employees !== null) best.employees = other.employees;
      if (best.companyInferred && !other.companyInferred && other.company) {
        best.company = other.company;
        best.companyInferred = false;
      }
    }
    best.mergedFrom = group.length;
    out.push(best);
  }
  return { leads: out, removed: usable.length - out.length, dropped };
}
