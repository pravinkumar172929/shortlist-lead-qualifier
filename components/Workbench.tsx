"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EnrichResult, Icp, Insight, Lead, ScoredLead, Tier } from "@/lib/types";
import { parseCsv } from "@/lib/csv";
import { companyFromTitle, dedupe, detectColumns, rowToLead, type ColumnMap } from "@/lib/normalize";
import { DEFAULT_ICP, scoreLead } from "@/lib/score";
import { fullCsv, hubspotCsv } from "@/lib/exporters";
import { demoResults, download, enrichAll, fetchInsight, getHealth, storage, type Health } from "@/lib/client/api";
import ImportScreen from "./ImportScreen";
import ColumnMapper from "./ColumnMapper";
import IcpPanel from "./IcpPanel";
import LeadTable, { type TierFilter } from "./LeadTable";
import LeadDrawer from "./LeadDrawer";

type Phase = { kind: "import" } | { kind: "map"; headers: string[]; rows: Record<string, string>[]; fileName: string } | { kind: "work" };

interface ImportStats {
  rows: number;
  removed: number;
  dropped: number;
  source: string;
}

const ICP_KEY = "shortlist.icp.v1";

export default function Workbench() {
  const [phase, setPhase] = useState<Phase>({ kind: "import" });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [results, setResults] = useState<Record<string, EnrichResult>>({});
  const [insights, setInsights] = useState<Record<string, Insight>>({});
  const [writing, setWriting] = useState<Set<string>>(new Set());
  const [icp, setIcp] = useState<Icp>(DEFAULT_ICP);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [query, setQuery] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = storage.get<Icp>(ICP_KEY);
    if (saved?.weights) setIcp(saved);
    getHealth().then(setHealth);
  }, []);

  const updateIcp = useCallback((next: Icp) => {
    setIcp(next);
    storage.set(ICP_KEY, next);
  }, []);

  const addResults = useCallback((batch: EnrichResult[]) => {
    setResults((prev) => {
      const next = { ...prev };
      for (const r of batch) next[r.id] = r;
      return next;
    });
  }, []);

  const start = useCallback(
    async (rows: Record<string, string>[], map: ColumnMap, source: string, demo = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const { leads: clean, removed, dropped } = dedupe(rows.map((r, i) => rowToLead(r, map, i)));
      setLeads(clean);
      setResults({});
      setInsights({});
      setSelectedId(null);
      setTierFilter("all");
      setQuery("");
      setVerifiedOnly(false);
      setStats({ rows: rows.length, removed, dropped, source });
      setPhase({ kind: "work" });

      if (demo) addResults(await demoResults(clean));
      else await enrichAll(clean, addResults, controller.signal);
    },
    [addResults],
  );

  const onFile = useCallback((text: string, fileName: string) => {
    const { headers, rows } = parseCsv(text);
    setPhase({ kind: "map", headers, rows, fileName });
  }, []);

  const onDomains = useCallback(
    (domains: string[]) => {
      const rows = domains.map((d) => ({ Website: d }));
      start(rows, { website: "Website" }, `${domains.length} pasted domains`);
    },
    [start],
  );

  const onSample = useCallback(async () => {
    const text = await (await fetch("/demo/sample-leads.csv")).text();
    const { headers, rows } = parseCsv(text);
    start(rows, detectColumns(headers), "Sample list (fictional companies)", true);
  }, [start]);

  const reset = () => {
    abortRef.current?.abort();
    setPhase({ kind: "import" });
    setLeads([]);
    setResults({});
    setStats(null);
  };

  // Scoring is pure and cheap, so the whole list re-ranks on every ICP edit.
  const scored: ScoredLead[] = useMemo(
    () =>
      leads
        .filter((l) => results[l.id])
        .map((l) => {
          const r = results[l.id];
          const named = l.companyInferred && r.enrichment?.title ? { ...l, company: companyFromTitle(r.enrichment.title) || l.company } : l;
          return scoreLead(named, r.emailCheck, r.enrichment, icp);
        })
        .sort((a, b) => b.score - a.score),
    [leads, results, icp],
  );

  const pending = leads.length - scored.length;

  const counts = useMemo(() => {
    const c: Record<Tier, number> = { hot: 0, warm: 0, cold: 0, unreachable: 0 };
    for (const l of scored) c[l.tier]++;
    return c;
  }, [scored]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scored.filter(
      (l) =>
        (tierFilter === "all" || l.tier === tierFilter) &&
        (!verifiedOnly || l.emailCheck.status === "valid") &&
        (!q || `${l.company} ${l.domain} ${l.firstName} ${l.lastName} ${l.title} ${l.industry} ${l.city} ${l.state}`.toLowerCase().includes(q)),
    );
  }, [scored, tierFilter, verifiedOnly, query]);

  const writeInsight = useCallback(async (lead: ScoredLead) => {
    setWriting((s) => new Set(s).add(lead.id));
    const ins = await fetchInsight(lead);
    setInsights((prev) => ({ ...prev, [lead.id]: ins }));
    setWriting((s) => {
      const n = new Set(s);
      n.delete(lead.id);
      return n;
    });
  }, []);

  const writeHotOpeners = async () => {
    for (const l of scored.filter((x) => x.tier === "hot" && !insights[x.id])) await writeInsight(l);
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const exportCsv = () => download(`shortlist-${stamp}.csv`, fullCsv(visible, insights));
  const exportHubspot = () => download(`shortlist-hubspot-${stamp}.csv`, hubspotCsv(visible, insights));

  const selected = scored.find((l) => l.id === selectedId) ?? null;
  const invalidEmails = scored.filter((l) => l.emailCheck.status === "invalid").length;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={reset} aria-label="Shortlist, start over">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          Shortlist
        </button>
        <div className="topbar-right">
          {health && (
            <span className="env" title="Where enrichment results are cached, and whether AI openers are on">
              {health.cache === "supabase" ? "Cache: Supabase" : "Cache: in memory"}, {health.ai ? "AI openers on" : "rule-based openers"}
            </span>
          )}
          {phase.kind === "work" && (
            <button className="btn ghost" onClick={reset}>
              New list
            </button>
          )}
        </div>
      </header>

      {phase.kind === "import" && <ImportScreen onFile={onFile} onDomains={onDomains} onSample={onSample} />}

      {phase.kind === "map" && (
        <ColumnMapper
          headers={phase.headers}
          rows={phase.rows}
          fileName={phase.fileName}
          onCancel={() => setPhase({ kind: "import" })}
          onConfirm={(map) => start(phase.rows, map, phase.fileName)}
        />
      )}

      {phase.kind === "work" && stats && (
        <div className="workspace">
          <IcpPanel icp={icp} onChange={updateIcp} onReset={() => updateIcp(DEFAULT_ICP)} />

          <main className="results">
            <section className="summary" aria-label="List summary">
              <div className="summary-head">
                <h1>{stats.source}</h1>
                <p className="muted">
                  {stats.rows} rows in, {leads.length} unique leads
                  {stats.removed > 0 && `, ${stats.removed} duplicates merged`}
                  {stats.dropped > 0 && `, ${stats.dropped} rows skipped (no website or email)`}
                  {invalidEmails > 0 && `, ${invalidEmails} bad emails caught`}
                </p>
              </div>
              <div className="tier-tally">
                {(["hot", "warm", "cold", "unreachable"] as const).map((t) => (
                  <button
                    key={t}
                    className={`tally tally-${t}`}
                    aria-pressed={tierFilter === t}
                    onClick={() => setTierFilter(tierFilter === t ? "all" : t)}
                  >
                    <strong>{counts[t]}</strong>
                    <span>{TIER_COPY[t]}</span>
                  </button>
                ))}
              </div>
              {pending > 0 && (
                <div className="progress" role="status">
                  <div className="progress-bar">
                    <span style={{ width: `${(scored.length / Math.max(1, leads.length)) * 100}%` }} />
                  </div>
                  Checking websites and emails: {scored.length} of {leads.length}
                </div>
              )}
            </section>

            <LeadTable
              leads={visible}
              pending={pending}
              total={scored.length}
              insights={insights}
              tierFilter={tierFilter}
              onTierFilter={setTierFilter}
              query={query}
              onQuery={setQuery}
              verifiedOnly={verifiedOnly}
              onVerifiedOnly={setVerifiedOnly}
              onSelect={setSelectedId}
              selectedId={selectedId}
              onExportCsv={exportCsv}
              onExportHubspot={exportHubspot}
              onWriteHot={writeHotOpeners}
              hotWithoutOpener={scored.filter((x) => x.tier === "hot" && !insights[x.id]).length}
              writingCount={writing.size}
            />
          </main>

          {selected && (
            <LeadDrawer
              lead={selected}
              insight={insights[selected.id]}
              writing={writing.has(selected.id)}
              onWrite={() => writeInsight(selected)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

const TIER_COPY: Record<Tier, string> = {
  hot: "Call this week",
  warm: "Nurture",
  cold: "Park",
  unreachable: "No way to reach",
};
