import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv } from "../lib/csv";
import { dedupe, detectColumns, normalizeDomain, parseEmployees, rowToLead } from "../lib/normalize";
import { extractSignals, robotsAllowsHome } from "../lib/extract";
import { DEFAULT_ICP, scoreLead } from "../lib/score";
import { rulesInsight } from "../lib/insights";
import type { EmailCheck, Enrichment } from "../lib/types";

test("parseCsv handles quotes, commas, CRLF and BOM", () => {
  const { headers, rows } = parseCsv('﻿Name,Note\r\n"Acme, Inc.","He said ""hi"""\r\nBeta,plain\r\n');
  assert.deepEqual(headers, ["Name", "Note"]);
  assert.equal(rows[0].Name, "Acme, Inc.");
  assert.equal(rows[0].Note, 'He said "hi"');
  assert.equal(rows[1].Name, "Beta");
});

test("toCsv escapes and blocks formula injection", () => {
  const out = toCsv(["a"], [{ a: "=HYPERLINK()" }, { a: 'x,"y"' }]);
  assert.equal(out, "a\r\n'=HYPERLINK()\r\n\"x,\"\"y\"\"\"");
});

test("normalizeDomain", () => {
  assert.equal(normalizeDomain("https://www.Acme.com/about?x=1"), "acme.com");
  assert.equal(normalizeDomain("shop.acme.co.uk"), "acme.co.uk");
  assert.equal(normalizeDomain("jane@acme.com"), "acme.com");
  assert.equal(normalizeDomain("not a domain"), "");
  assert.equal(normalizeDomain("10.0.0.1"), "");
});

test("parseEmployees", () => {
  assert.equal(parseEmployees("11-50"), 31);
  assert.equal(parseEmployees("1,200"), 1200);
  assert.equal(parseEmployees(""), null);
});

test("detectColumns maps common export headers", () => {
  const map = detectColumns(["Company Name", "Website", "First Name", "Last Name", "Job Title", "Email Address", "Employee Count", "State"]);
  assert.equal(map.company, "Company Name");
  assert.equal(map.website, "Website");
  assert.equal(map.title, "Job Title");
  assert.equal(map.email, "Email Address");
  assert.equal(map.employees, "Employee Count");
});

test("dedupe merges by email and by person+domain, keeps the most complete row", () => {
  const headers = ["Company", "Website", "First Name", "Last Name", "Email", "Phone"];
  const map = detectColumns(headers);
  const rows = [
    { Company: "Acme", Website: "acme.com", "First Name": "Jane", "Last Name": "Doe", Email: "jane@acme.com", Phone: "" },
    { Company: "Acme", Website: "https://www.acme.com", "First Name": "jane", "Last Name": "doe", Email: "", Phone: "555-201-3344" },
    { Company: "Acme Co", Website: "", "First Name": "", "Last Name": "", Email: "JANE@acme.com", Phone: "" },
    { Company: "Beta", Website: "beta.com", "First Name": "Bo", "Last Name": "", Email: "", Phone: "" },
    { Company: "Nowhere", Website: "", "First Name": "", "Last Name": "", Email: "", Phone: "" },
  ];
  const { leads, removed, dropped } = dedupe(rows.map((r, i) => rowToLead(r, map, i)));
  assert.equal(leads.length, 2);
  assert.equal(removed, 2);
  assert.equal(dropped, 1);
  const jane = leads.find((l) => l.domain === "acme.com")!;
  assert.equal(jane.email, "jane@acme.com");
  assert.equal(jane.phone, "555-201-3344");
  assert.equal(jane.mergedFrom, 3);
});

const html = `<!doctype html><html><head><title>Ridgeway Heating &amp; Air | HVAC in Columbus</title>
<meta name="description" content="Family-owned HVAC contractor since 1987.">
<script src="https://cdn.example/wp-content/themes/x.js"></script></head>
<body><a href="/careers">Careers</a><a href="https://www.linkedin.com/company/ridgeway-hvac">in</a>
<a href="https://www.facebook.com/ridgewayhvac">fb</a>
<p>Call (614) 555-0182 or email service@ridgewayhvac.com</p>
<footer>© 2012-2019 Ridgeway Heating</footer></body></html>`;

test("extractSignals pulls the useful facts", () => {
  const s = extractSignals(html, { domain: "ridgewayhvac.com", finalUrl: "https://ridgewayhvac.com/", now: new Date("2026-10-10") });
  assert.equal(s.title, "Ridgeway Heating & Air | HVAC in Columbus");
  assert.equal(s.copyrightYear, 2019);
  assert.ok(s.tech.includes("WordPress"));
  assert.equal(s.hasAnalytics, false);
  assert.equal(s.hasCareersPage, true);
  assert.deepEqual(s.emailsFound, ["service@ridgewayhvac.com"]);
  assert.equal(s.phonesFound[0], "(614) 555-0182");
  assert.equal(s.socials.linkedin, "https://www.linkedin.com/company/ridgeway-hvac");
});

test("robotsAllowsHome respects groups and longest match", () => {
  assert.equal(robotsAllowsHome("User-agent: *\nDisallow: /", "ShortlistBot"), false);
  assert.equal(robotsAllowsHome("User-agent: *\nDisallow: /admin", "ShortlistBot"), true);
  assert.equal(robotsAllowsHome("User-agent: *\nDisallow: /\n\nUser-agent: ShortlistBot\nAllow: /", "ShortlistBot"), true);
  assert.equal(robotsAllowsHome("", "ShortlistBot"), true);
});

test("scoreLead ranks an owner at an in-profile, under-tooled company as hot", () => {
  const lead = rowToLead(
    { Company: "Ridgeway Heating", Website: "ridgewayhvac.com", "First Name": "Tom", "Last Name": "Reyes", Title: "Owner", Email: "tom@ridgewayhvac.com", Industry: "HVAC", Employees: "35" },
    detectColumns(["Company", "Website", "First Name", "Last Name", "Title", "Email", "Industry", "Employees"]),
    0,
  );
  const email: EmailCheck = { status: "valid", notes: [], hasMx: true };
  const site: Enrichment = {
    ...extractSignals(html, { domain: "ridgewayhvac.com", finalUrl: "https://ridgewayhvac.com/", now: new Date("2026-10-10") }),
    fetchedAt: "",
    reachable: true,
    robotsBlocked: false,
    error: null,
  };
  const scored = scoreLead(lead, email, site, DEFAULT_ICP, 2026);
  assert.equal(scored.tier, "hot");
  assert.ok(scored.score >= 85, `score ${scored.score}`);
  assert.equal(Math.round(scored.signals.reduce((a, s) => a + s.max, 0)), 100);

  const intern = scoreLead({ ...lead, title: "Marketing Intern", employees: 5000, industry: "Software" }, { status: "missing", notes: [], hasMx: null }, null, DEFAULT_ICP, 2026);
  assert.ok(intern.score < 30, `score ${intern.score}`);

  const ins = rulesInsight(scored);
  assert.match(ins.opener, /^Hi Tom,/);
  assert.match(ins.opener, /2019/);
});
