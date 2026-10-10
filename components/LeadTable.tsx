"use client";

import { useEffect, useRef, useState } from "react";
import type { Insight, ScoredLead, Tier } from "@/lib/types";
import { FitMeter } from "./FitMeter";

export type TierFilter = Tier | "all";

interface Props {
  leads: ScoredLead[];
  pending: number;
  total: number;
  insights: Record<string, Insight>;
  tierFilter: TierFilter;
  onTierFilter: (t: TierFilter) => void;
  query: string;
  onQuery: (q: string) => void;
  verifiedOnly: boolean;
  onVerifiedOnly: (v: boolean) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onExportCsv: () => void;
  onExportHubspot: () => void;
  onWriteHot: () => void;
  hotWithoutOpener: number;
  writingCount: number;
}

const EMAIL_LABEL = { valid: "Verified", risky: "Risky", invalid: "Bad", missing: "None" } as const;

export function highlights(l: ScoredLead, insight?: Insight): string[] {
  const e = l.enrichment;
  const out: string[] = [];
  if (e?.hasCareersPage) out.push("Hiring");
  if (e?.copyrightYear && new Date().getFullYear() - e.copyrightYear >= 3) out.push(`Site from ${e.copyrightYear}`);
  if (e?.reachable && !e.hasAnalytics) out.push("No analytics");
  if (e?.robotsBlocked) out.push("Site blocks bots");
  if (l.mergedFrom > 1) out.push(`${l.mergedFrom} rows merged`);
  if (insight) out.push("Opener ready");
  return out.slice(0, 3);
}

function ExportMenu({ count, onCsv, onHubspot }: { count: number; onCsv: () => void; onHubspot: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="btn primary" aria-haspopup="menu" aria-expanded={open} disabled={count === 0} onClick={() => setOpen(!open)}>
        Export {count} lead{count === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button role="menuitem" onClick={() => (onCsv(), setOpen(false))}>
            <strong>Full CSV</strong>
            <span>Scores, reasons, openers and your original columns</span>
          </button>
          <button role="menuitem" onClick={() => (onHubspot(), setOpen(false))}>
            <strong>HubSpot import</strong>
            <span>Contact columns HubSpot maps automatically; bad emails left out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function LeadTable(p: Props) {
  const filtered = p.tierFilter !== "all" || p.verifiedOnly || p.query.trim() !== "";
  return (
    <section className="table-wrap" aria-label="Ranked leads">
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search company, person, title, place" aria-label="Search leads" value={p.query} onChange={(e) => p.onQuery(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={p.verifiedOnly} onChange={(e) => p.onVerifiedOnly(e.target.checked)} />
          Verified email only
        </label>
        <div className="toolbar-right">
          {p.hotWithoutOpener > 0 && (
            <button className="btn" onClick={p.onWriteHot} disabled={p.writingCount > 0}>
              {p.writingCount > 0 ? "Writing openers…" : `Write openers for ${p.hotWithoutOpener} hot lead${p.hotWithoutOpener === 1 ? "" : "s"}`}
            </button>
          )}
          <ExportMenu count={p.leads.length} onCsv={p.onExportCsv} onHubspot={p.onExportHubspot} />
        </div>
      </div>

      <div className="table-scroll">
        <table className="leads">
          <thead>
            <tr>
              <th scope="col" className="col-score">
                Fit
              </th>
              <th scope="col">Company</th>
              <th scope="col">Contact</th>
              <th scope="col">Email</th>
              <th scope="col">Worth knowing</th>
            </tr>
          </thead>
          <tbody>
            {p.leads.map((l) => (
              <tr key={l.id} className={`${p.selectedId === l.id ? "is-selected " : ""}row-${l.tier}`} onClick={() => p.onSelect(l.id)}>
                <td className="col-score">
                  <div className="score-cell">
                    <span className="score">{l.score}</span>
                    <FitMeter signals={l.signals} tier={l.tier} />
                  </div>
                </td>
                <td>
                  <button
                    className="row-open"
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onSelect(l.id);
                    }}
                  >
                    {l.company || l.domain}
                  </button>
                  <span className="sub">
                    {[l.domain, l.industry, [l.city, l.state].filter(Boolean).join(", ")].filter(Boolean).join(", ")}
                  </span>
                </td>
                <td>
                  {l.firstName || l.lastName ? `${l.firstName} ${l.lastName}`.trim() : <span className="muted">No contact</span>}
                  <span className="sub">{l.title}</span>
                </td>
                <td>
                  <span className={`badge email-${l.emailCheck.status}`} title={l.emailCheck.notes.join("; ")}>
                    {EMAIL_LABEL[l.emailCheck.status]}
                  </span>
                </td>
                <td className="chips">
                  {highlights(l, p.insights[l.id]).map((h) => (
                    <span className="chip" key={h}>
                      {h}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {Array.from({ length: Math.min(p.pending, 6) }, (_, i) => (
              <tr key={`pending-${i}`} className="row-pending" aria-hidden>
                <td className="col-score">
                  <span className="skeleton skeleton-score" />
                </td>
                <td>
                  <span className="skeleton" />
                </td>
                <td>
                  <span className="skeleton short" />
                </td>
                <td>
                  <span className="skeleton tiny" />
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        {p.leads.length === 0 && p.pending === 0 && (
          <div className="empty">
            {filtered ? (
              <>
                <p>No leads match these filters.</p>
                <button
                  className="btn"
                  onClick={() => {
                    p.onTierFilter("all");
                    p.onVerifiedOnly(false);
                    p.onQuery("");
                  }}
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p>No leads to show yet.</p>
            )}
          </div>
        )}
      </div>
      {p.total > 0 && filtered && p.leads.length > 0 && (
        <p className="muted small table-foot">
          Showing {p.leads.length} of {p.total}. Export includes only what&rsquo;s shown.
        </p>
      )}
    </section>
  );
}
