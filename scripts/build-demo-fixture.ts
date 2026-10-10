// Builds public/demo/sample-enrichment.json: a frozen enrichment snapshot for
// the bundled sample list, so the demo runs offline and gives the same result
// every time. The sample companies are fictional, so instead of fetching real
// sites we describe each homepage and run it through the real extractor and
// email checker. Run with: npx tsx scripts/build-demo-fixture.ts

import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../lib/csv";
import { detectColumns, dedupe, rowToLead } from "../lib/normalize";
import { extractSignals } from "../lib/extract";
import { checkEmail } from "../lib/server/emailCheck";
import type { EmailCheck, Enrichment } from "../lib/types";

interface SiteSpec {
  title: string;
  description: string;
  copyright?: number;
  scripts?: string[];
  links?: string[];
  body?: string;
  http?: boolean;
  down?: string;
  robotsBlocked?: boolean;
}

const WP = "/wp-content/themes/base/style.css";
const GA = "https://www.googletagmanager.com/gtag/js?id=G-XXXX";
const HS = "https://js.hs-scripts.com/1234.js";
const WIX = "https://static.wixstatic.com/main.js";
const SHOP = "https://cdn.shopify.com/s/theme.js";
const INTERCOM = "https://widget.intercom.io/widget/abc";

const SITES: Record<string, SiteSpec> = {
  "ridgewayhvac-demo.com": { title: "Ridgeway Heating & Air | HVAC Repair in Columbus", description: "Family-owned HVAC contractor serving Columbus since 1987.", copyright: 2019, scripts: [WP], links: ["/careers", "https://www.linkedin.com/company/ridgeway-hvac-demo", "https://www.facebook.com/ridgewayhvacdemo"], body: "Call (614) 555-0182 · service@ridgewayhvac-demo.com · We're hiring technicians" },
  "cobaltprecision-demo.com": { title: "Cobalt Precision Machining — CNC & Contract Manufacturing", description: "ISO 9001 CNC machining for aerospace and medical OEMs.", copyright: 2021, scripts: [WP, GA], links: ["/careers", "https://www.linkedin.com/company/cobalt-precision-demo"], body: "Phone (937) 555-0144" },
  "harborpointlogistics-demo.com": { title: "Harbor Point Logistics | Port Drayage & Warehousing", description: "Drayage, warehousing and last-mile logistics out of the Port of Savannah.", copyright: 2024, scripts: [GA, HS], links: ["/blog", "/jobs", "https://www.linkedin.com/company/harbor-point-logistics-demo"] },
  "greenfieldlandscape-demo.com": { title: "Greenfield Landscape Co. – Raleigh Landscaping", description: "Commercial and residential landscaping in the Triangle.", copyright: 2016, scripts: [WIX], links: ["https://www.facebook.com/greenfieldlandscapedemo"], body: "(919) 555-0110" },
  "summitdental-demo.com": { title: "Summit Family Dental | Boise Dentist", description: "Gentle family dentistry in Boise.", copyright: 2023, scripts: [WP, GA], links: ["/blog", "https://www.instagram.com/summitdentaldemo"] },
  "northlineplumbing-demo.com": { title: "Northline Plumbing - Tulsa Plumbers", description: "24/7 residential and commercial plumbing in Tulsa.", copyright: 2014, http: true, body: "Call 918-555-0130" },
  "brightpathcpa-demo.com": { title: "Brightpath Accounting | CPA Firm in Madison", description: "Tax, audit and advisory for owner-led businesses.", copyright: 2020, scripts: [WP], links: ["https://www.linkedin.com/company/brightpath-cpa-demo"] },
  "ironcladbuilds-demo.com": { title: "Ironclad Construction | Commercial General Contractor", description: "Design-build commercial construction across Idaho.", copyright: 2025, scripts: [GA, HS], links: ["/careers", "/news", "https://www.linkedin.com/company/ironclad-builds-demo"] },
  "velocitycloud-demo.io": { title: "Velocity Cloud Labs — The AI platform for revenue teams", description: "Series C SaaS for revenue operations.", copyright: 2026, scripts: [GA, HS, INTERCOM, "/_next/static/chunks/main.js"], links: ["/careers", "/blog", "https://www.linkedin.com/company/velocity-cloud-demo"], body: '<script id="__NEXT_DATA__"></script>' },
  "keystoneins-demo.com": { title: "", description: "", robotsBlocked: true },
  "pioneersupply-demo.com": { title: "Pioneer Supply & Distribution | Industrial MRO Supplies", description: "Industrial MRO distribution across the Plains since 1972.", copyright: 2018, scripts: [WP], links: ["/shop", "/cart", "https://www.linkedin.com/company/pioneer-supply-demo"] },
  "lakesideauto-demo.com": { title: "Lakeside Auto Repair", description: "Honest auto repair in Duluth.", copyright: 2015, scripts: [WIX] },
  "maplestreetbakery-demo.com": { title: "Maple Street Bakery", description: "Sourdough, pastries and coffee in downtown Burlington.", copyright: 2025, scripts: [SHOP, GA], links: ["/cart", "https://www.instagram.com/maplestreetbakerydemo"] },
  "atlasfleet-demo.com": { title: "", description: "", down: "Website did not respond" },
  "crescentelectric-demo.com": { title: "Crescent Electrical Contractors | Mobile, AL", description: "Commercial and industrial electrical construction.", copyright: 2017, scripts: [WP], links: ["/careers", "https://www.facebook.com/crescentelectricdemo"], body: "(251) 555-0109" },
  "evergreendentalstudio-demo.com": { title: "Evergreen Dental Studio", description: "Cosmetic and family dentistry in Spokane.", copyright: 2022, scripts: [WP, GA], links: ["/blog"] },
  "tridentmetal-demo.com": { title: "Trident Metal Works | Custom Fabrication & Welding", description: "Custom metal fabrication and manufacturing for industrial clients.", copyright: 2013, http: true, links: ["https://www.linkedin.com/company/trident-metal-demo"], body: "(814) 555-0141" },
  "bluewaterpools-demo.com": { title: "Bluewater Pool Service | Tampa Bay", description: "Weekly pool cleaning and repair.", copyright: 2024, scripts: [WIX, GA], links: ["https://www.facebook.com/bluewaterpoolsdemo"] },
  "summitridgehvac-demo.com": { title: "Summit Ridge HVAC | Heating & Cooling", description: "Furnace and AC installs for homes and light commercial.", copyright: 2018, scripts: [WP], links: ["https://www.linkedin.com/company/summit-ridge-hvac-demo"], body: "contact: hello@summitridgehvac-demo.com (720) 555-0190" },
  "copperlinehvac-demo.com": { title: "Copperline HVAC Solutions | Commercial HVAC Denver", description: "Commercial HVAC service contracts and retrofits.", copyright: 2020, scripts: [WP], links: ["/careers", "https://www.linkedin.com/company/copperline-hvac-demo"] },
  "oldmillprinting-demo.com": { title: "Old Mill Printing", description: "Commercial printing and signage in Lancaster County.", copyright: 2011, http: true, body: "Est. 1979 (717) 555-0164" },
};

function html(s: SiteSpec): string {
  return `<!doctype html><html><head><title>${s.title.replace(/&/g, "&amp;")}</title>
<meta name="description" content="${s.description}">
${(s.scripts ?? []).map((src) => `<script src="${src}"></script>`).join("\n")}</head>
<body><nav>${(s.links ?? []).map((h) => `<a href="${h}">link</a>`).join("")}</nav><main>${s.body ?? ""}</main>
<footer>${s.copyright ? `© ${s.copyright}` : ""}</footer></body></html>`;
}

async function main() {
  const now = new Date("2026-10-10");
  const csv = readFileSync(new URL("../public/demo/sample-leads.csv", import.meta.url), "utf8");
  const { headers, rows } = parseCsv(csv);
  const map = detectColumns(headers);
  const { leads } = dedupe(rows.map((r, i) => rowToLead(r, map, i)));

  const sites: Record<string, Enrichment> = {};
  for (const [domain, spec] of Object.entries(SITES)) {
    const base = { domain, fetchedAt: now.toISOString(), robotsBlocked: false, error: null as string | null };
    if (spec.down || spec.robotsBlocked) {
      sites[domain] = {
        ...extractSignals("", { domain, finalUrl: "", now }),
        ...base,
        finalUrl: null,
        reachable: false,
        robotsBlocked: Boolean(spec.robotsBlocked),
        error: spec.down ?? "Site asks bots not to read its homepage",
      };
      continue;
    }
    const finalUrl = `${spec.http ? "http" : "https"}://${domain}/`;
    sites[domain] = { ...extractSignals(html(spec), { domain, finalUrl, now }), ...base, reachable: true };
  }

  // Every demo domain "has" a mail server except the bakery, to show an MX failure.
  const fakeMx = async (d: string) => d !== "maplestreetbakery-demo.com";
  const emails: Record<string, EmailCheck> = {};
  for (const l of leads) emails[l.email] = await checkEmail(l.email, l.domain, fakeMx);

  const out = new URL("../public/demo/sample-enrichment.json", import.meta.url);
  writeFileSync(out, JSON.stringify({ generatedAt: now.toISOString(), sites, emails }, null, 2));
  console.log(`Wrote ${Object.keys(sites).length} sites and ${Object.keys(emails).length} email checks`);
}

main();
