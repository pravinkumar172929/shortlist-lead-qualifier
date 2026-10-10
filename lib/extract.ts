// Pure HTML -> signals extraction. No DOM library: regexes over the raw HTML
// are fast, dependency-free and robust to broken markup, which is common on
// the small-business sites this tool targets.

import type { Enrichment, Socials } from "./types";

/** Technology fingerprints: name -> patterns seen in page source. */
const TECH: Array<[string, RegExp]> = [
  ["WordPress", /wp-content|wp-includes|wordpress/i],
  ["Wix", /wix\.com|wixstatic|_wixCssImports/i],
  ["Squarespace", /squarespace\.com|static1\.squarespace/i],
  ["GoDaddy Builder", /img1\.wsimg\.com|godaddy\s*website\s*builder/i],
  ["Weebly", /weebly\.com|editmysite\.com/i],
  ["Shopify", /cdn\.shopify\.com|shopify\.theme/i],
  ["WooCommerce", /woocommerce/i],
  ["Webflow", /webflow\.(com|io)|data-wf-page/i],
  ["HubSpot", /js\.hs-scripts\.com|hs-analytics|hubspot/i],
  ["Salesforce", /salesforce|pardot/i],
  ["Mailchimp", /mailchimp|list-manage\.com/i],
  ["Google Analytics", /google-analytics\.com|googletagmanager\.com\/gtag|gtag\(|ga\('create'/i],
  ["Google Tag Manager", /googletagmanager\.com\/gtm/i],
  ["Meta Pixel", /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i],
  ["Intercom", /widget\.intercom\.io|intercomSettings/i],
  ["Drift", /js\.driftt\.com|drift\.com/i],
  ["Tawk.to", /embed\.tawk\.to/i],
  ["Zendesk", /zdassets\.com|zendesk/i],
  ["Calendly", /calendly\.com/i],
  ["Stripe", /js\.stripe\.com/i],
  ["React", /data-reactroot|__NEXT_DATA__|react(-dom)?(\.production)?\.min\.js/i],
  ["jQuery", /jquery(\.min)?\.js/i],
];

const ANALYTICS = new Set(["Google Analytics", "Google Tag Manager", "Meta Pixel", "HubSpot"]);
const CHAT = new Set(["Intercom", "Drift", "Tawk.to", "Zendesk"]);

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") : "";
}

function socials(html: string): Socials {
  const find = (re: RegExp) => html.match(re)?.[0];
  return {
    linkedin: find(/https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_%-]+/i),
    facebook: find(/https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|tr\b|plugins)[A-Za-z0-9.\-]+/i),
    instagram: find(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i),
    x: find(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share)[A-Za-z0-9_]+/i),
  };
}

function emails(html: string, domain: string): string[] {
  const found = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  const clean = found
    .map((e) => e.toLowerCase())
    .filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e))
    .filter((e) => !/(sentry|wixpress|example|domain\.com|yourname|email\.com)/.test(e));
  // Prefer addresses on the company's own domain.
  const own = clean.filter((e) => domain && e.endsWith(domain));
  return [...new Set(own.length ? own : clean)].slice(0, 5);
}

function phones(text: string): string[] {
  const found = text.match(/(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) ?? [];
  return [...new Set(found.map((p) => p.trim()))].slice(0, 3);
}

function copyrightYear(text: string, now: number): number | null {
  const re = /(?:©|&copy;|\(c\)|copyright)\s*(?:\d{4}\s*[-–—]\s*)?((?:19|20)\d{2})/gi;
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    const y = Number(m[1]);
    if (y <= now + 1 && (best === null || y > best)) best = y;
  }
  return best;
}

export function extractSignals(html: string, opts: { domain: string; finalUrl: string; now?: Date }): Omit<Enrichment, "fetchedAt" | "reachable" | "robotsBlocked" | "error"> {
  const year = (opts.now ?? new Date()).getFullYear();
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 160);
  const description = (meta(html, "description") || meta(html, "og:description")).slice(0, 300);
  const tech = TECH.filter(([, re]) => re.test(html)).map(([name]) => name);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const hrefs = (html.match(/href=["'][^"']+["']/gi) ?? []).join(" ").toLowerCase();

  return {
    domain: opts.domain,
    https: opts.finalUrl.startsWith("https://"),
    finalUrl: opts.finalUrl,
    title,
    description,
    tech,
    copyrightYear: copyrightYear(text, year),
    socials: socials(html),
    emailsFound: emails(html, opts.domain),
    phonesFound: phones(decode(text)),
    hasCareersPage: /\/(careers?|jobs|join-us|work-with-us|hiring|employment)\b/.test(hrefs) || /we.?re hiring|join our team/i.test(text),
    hasEcommerce: tech.includes("Shopify") || tech.includes("WooCommerce") || /\/(cart|checkout|shop)\b/.test(hrefs),
    hasBlog: /\/(blog|news|articles|insights)\b/.test(hrefs),
    hasChatWidget: tech.some((t) => CHAT.has(t)),
    hasAnalytics: tech.some((t) => ANALYTICS.has(t)),
  };
}

/**
 * Minimal robots.txt check: does any group that applies to us (our UA or "*")
 * disallow the homepage? Longest-match Allow/Disallow, as Google does.
 */
export function robotsAllowsHome(robots: string, userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      if (value) current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  const rules = applicable.flatMap((g) => g.rules).filter((r) => "/".startsWith(r.path.replace(/\*$/, "").replace(/\$$/, "")));
  if (rules.length === 0) return true;
  rules.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return rules[0].allow;
}
