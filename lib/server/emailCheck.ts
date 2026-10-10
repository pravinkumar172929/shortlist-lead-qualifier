// Email verification without sending mail: syntax, disposable and role inbox
// detection, and a DNS MX lookup to confirm the domain can receive email.
// (SMTP mailbox probing is deliberately left out: it is slow, often blocked,
// and can get a sender IP blocklisted.)

import { promises as dns } from "node:dns";
import type { EmailCheck } from "../types";
import { isFreeMailDomain } from "../normalize";
import { cacheGet, cacheSet } from "./cache";

const SYNTAX = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com", "dispostable.com", "maildrop.cc",
]);

const ROLE_INBOXES = new Set([
  "info", "sales", "admin", "support", "contact", "hello", "office", "team", "help",
  "billing", "accounts", "marketing", "jobs", "careers", "service", "enquiries", "inquiries", "noreply", "no-reply",
]);

async function hasMx(domain: string): Promise<boolean | null> {
  const key = `mx:${domain}`;
  const cached = await cacheGet<boolean>(key);
  if (cached !== null) return cached;
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    const ok = records.length > 0;
    await cacheSet(key, ok, 7);
    return ok;
  } catch (err) {
    const code = (err as { code?: string }).code;
    // ENOTFOUND / ENODATA are definitive answers; timeouts and network errors are not.
    if (code === "ENOTFOUND" || code === "ENODATA") {
      await cacheSet(key, false, 1);
      return false;
    }
    return null;
  }
}

export async function checkEmail(
  email: string,
  companyDomain: string,
  lookupMx: (domain: string) => Promise<boolean | null> = hasMx,
): Promise<EmailCheck> {
  if (!email) return { status: "missing", notes: ["No email on file"], hasMx: null };
  if (!SYNTAX.test(email)) return { status: "invalid", notes: ["Not a valid email address"], hasMx: null };

  const [local, domain] = email.split("@");
  const notes: string[] = [];
  let status: EmailCheck["status"] = "valid";

  if (DISPOSABLE.has(domain)) return { status: "invalid", notes: ["Disposable email provider"], hasMx: null };

  if (ROLE_INBOXES.has(local)) {
    status = "risky";
    notes.push(`Shared inbox (${local}@), may not reach a decision maker`);
  }
  if (isFreeMailDomain(domain)) {
    status = "risky";
    notes.push("Personal mailbox, not a company address");
  } else if (companyDomain && !domain.endsWith(companyDomain)) {
    notes.push(`Email domain differs from website (${companyDomain})`);
  }

  const mx = await lookupMx(domain);
  if (mx === false) return { status: "invalid", notes: ["Domain has no mail server (no MX record)"], hasMx: false };
  if (mx === null) {
    if (status === "valid") status = "risky";
    notes.push("Could not confirm the mail server");
  }
  if (status === "valid") notes.push("Company address with a working mail server");
  return { status, notes, hasMx: mx };
}
