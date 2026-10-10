# 2-minute walkthrough script

Roughly 260 words spoken. Record the screen at 1440×900 with the sample list loaded.

**0:00 – 0:20 · The problem** *(import screen)*
"SaaSquatch is great at finding companies. But after the scrape, a rep is staring at a CSV with hundreds of rows: duplicates, dead emails, and no idea who to call first. I built Shortlist to do that triage."

**0:20 – 1:10 · Demo** *(click "Try a sample list")*
"Twenty-four rows go in. It merged the duplicates, caught two bad emails, read each company's website, and ranked everyone."
*(point at a fit meter)* "Every row has a fit meter: one cell per signal, so you can see why a lead ranks where it does."
*(open Ridgeway)* "Ridgeway is an owner, the right size, in a target industry, with a verified email. And their site hasn't changed since 2019, with no analytics and no CRM. For Caprae that's not a red flag, it's upside you can create after an acquisition. One click writes a reason to call and a first line."
*(drag the Reachability or Modernization slider)* "The profile is editable and the list re-ranks instantly."
*(Export → HubSpot)* "Then export the call list straight into HubSpot."

**1:10 – 1:45 · How it's built**
"Next.js on Vercel. Parsing, dedupe and scoring run in the browser, so they're instant. Email checks and website reads run in serverless functions, in small batches with timeouts. Results are cached in Supabase Postgres for a week, so no site is hit twice. It honours robots.txt and never bypasses blocks. AI notes use Claude when there's a key, and rules when there isn't."

**1:45 – 2:00 · Value**
"The result: a rep opens a ranked call list with reasons, not a raw spreadsheet. Next I'd add a headless-browser fallback for JavaScript-heavy sites and direct CRM sync."
