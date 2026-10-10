// Fetches a company's homepage politely and turns it into an Enrichment.
// Polite = identifies itself, honours robots.txt, one page per domain, short
// timeouts, a size cap, and a 7-day cache so a domain is never hit twice a week.

import { promises as dns } from "node:dns";
import type { Enrichment } from "../types";
import { extractSignals, robotsAllowsHome } from "../extract";
import { cacheGet, cacheSet } from "./cache";

const USER_AGENT = "ShortlistBot/1.0 (lead qualification; one homepage fetch per domain per week)";
const TIMEOUT_MS = 7000;
const MAX_BYTES = 1_500_000;

async function fetchText(url: string, timeoutMs = TIMEOUT_MS): Promise<{ status: number; url: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      cache: "no-store",
    });
    // Read at most MAX_BYTES so a huge page cannot stall the function.
    const reader = res.body?.getReader();
    let text = "";
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      while (received < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        text += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    }
    return { status: res.status, url: res.url || url, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Blocks domains that resolve to private or loopback addresses (SSRF guard). */
async function resolvesToPublicIp(domain: string): Promise<boolean> {
  try {
    const addrs = await dns.lookup(domain, { all: true });
    return addrs.length > 0 && addrs.every(({ address: a }) =>
      !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a) &&
      !/^(::1$|::$|f[cd]|fe80:|::ffff:(10|127|192\.168)\.)/i.test(a));
  } catch {
    return false;
  }
}

function emptyEnrichment(domain: string, patch: Partial<Enrichment>): Enrichment {
  return {
    domain,
    fetchedAt: new Date().toISOString(),
    reachable: false,
    robotsBlocked: false,
    https: false,
    finalUrl: null,
    title: "",
    description: "",
    tech: [],
    copyrightYear: null,
    socials: {},
    emailsFound: [],
    phonesFound: [],
    hasCareersPage: false,
    hasEcommerce: false,
    hasBlog: false,
    hasChatWidget: false,
    hasAnalytics: false,
    error: null,
    ...patch,
  };
}

export async function enrichDomain(domain: string, { force = false } = {}): Promise<Enrichment> {
  const key = `site:${domain}`;
  if (!force) {
    const cached = await cacheGet<Enrichment>(key);
    if (cached) return cached;
  }

  let result: Enrichment;
  if (!(await resolvesToPublicIp(domain))) {
    result = emptyEnrichment(domain, { error: "Domain does not resolve to a public website" });
    await cacheSet(key, result, 1);
    return result;
  }
  try {
    // robots.txt first. A missing or unreadable file means "allowed".
    try {
      const robots = await fetchText(`https://${domain}/robots.txt`, 4000);
      if (robots.status === 200 && !robotsAllowsHome(robots.text, "ShortlistBot")) {
        result = emptyEnrichment(domain, { robotsBlocked: true, error: "Site asks bots not to read its homepage" });
        await cacheSet(key, result, 7);
        return result;
      }
    } catch {
      /* ignore */
    }

    let page: Awaited<ReturnType<typeof fetchText>> | null = null;
    for (const url of [`https://${domain}/`, `https://www.${domain}/`, `http://${domain}/`]) {
      try {
        page = await fetchText(url);
        if (page.status < 400) break;
      } catch {
        page = null;
      }
    }

    if (!page || page.status >= 400) {
      result = emptyEnrichment(domain, { error: page ? `Website returned HTTP ${page.status}` : "Website did not respond" });
    } else {
      result = {
        ...extractSignals(page.text, { domain, finalUrl: page.url }),
        fetchedAt: new Date().toISOString(),
        reachable: true,
        robotsBlocked: false,
        error: null,
      };
    }
  } catch (err) {
    result = emptyEnrichment(domain, { error: err instanceof Error ? err.message : "Unknown error" });
  }

  // Failures are cached briefly so a flaky site gets retried tomorrow.
  await cacheSet(key, result, result.reachable ? 7 : 1);
  return result;
}
