"use client";

import { useEffect, useRef, useState } from "react";
import type { Insight, ScoredLead } from "@/lib/types";
import { CellGlyph, FitMeter } from "./FitMeter";

const TIER_NAME = { hot: "Hot: call this week", warm: "Warm: nurture", cold: "Cold: park", unreachable: "No way to reach" } as const;

interface Props {
  lead: ScoredLead;
  insight?: Insight;
  writing: boolean;
  onWrite: () => void;
  onClose: () => void;
}

export default function LeadDrawer({ lead: l, insight, writing, onWrite, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const e = l.enrichment;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [l.id, onClose]);

  useEffect(() => setCopied(false), [l.id, insight]);

  const copy = async () => {
    if (!insight) return;
    try {
      await navigator.clipboard.writeText(insight.opener);
      setCopied(true);
    } catch {
      /* clipboard blocked; text is still selectable */
    }
  };

  const person = `${l.firstName} ${l.lastName}`.trim();
  const phone = l.phone || e?.phonesFound[0];

  return (
    <aside className="drawer" role="dialog" aria-modal="false" aria-labelledby="drawer-title">
      <div className="drawer-head">
        <div>
          <h2 id="drawer-title">{l.company || l.domain}</h2>
          {l.domain && (
            <a className="sub" href={e?.finalUrl ?? `https://${l.domain}`} target="_blank" rel="noreferrer noopener">
              {l.domain}
            </a>
          )}
        </div>
        <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>

      <div className={`drawer-score tier-${l.tier}`}>
        <span className="big-score">{l.score}</span>
        <div>
          <strong>{TIER_NAME[l.tier]}</strong>
          <FitMeter signals={l.signals} tier={l.tier} size="large" />
        </div>
      </div>

      <section className="drawer-section">
        <h3>Next step</h3>
        {insight ? (
          <div className="insight">
            <p>{insight.why}</p>
            <blockquote>{insight.opener}</blockquote>
            <div className="insight-actions">
              <button className="btn" onClick={copy}>
                {copied ? "Copied" : "Copy opener"}
              </button>
              {l.email && (
                <a className="btn ghost" href={`mailto:${l.email}?body=${encodeURIComponent(insight.opener)}`}>
                  Open in email
                </a>
              )}
              <span className="muted small">{insight.source === "ai" ? "Written by AI from the facts below" : "Written from the facts below"}</span>
            </div>
          </div>
        ) : (
          <button className="btn primary" onClick={onWrite} disabled={writing}>
            {writing ? "Writing…" : "Write why-call and opener"}
          </button>
        )}
      </section>

      <section className="drawer-section">
        <h3>Why it scored {l.score}</h3>
        <ul className="signals">
          {l.signals.map((s, i) => (
            <li key={s.key}>
              <CellGlyph index={i} />
              <div>
                <div className="signal-top">
                  <strong>{s.label}</strong>
                  <span className="pts">
                    {Math.round(s.points)}/{Math.round(s.max)}
                  </span>
                </div>
                <span className="muted">{s.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="drawer-section">
        <h3>Contact</h3>
        <dl className="facts">
          <dt>Person</dt>
          <dd>{person ? `${person}${l.title ? `, ${l.title}` : ""}` : <span className="muted">Not in the list</span>}</dd>
          <dt>Email</dt>
          <dd>
            {l.email || <span className="muted">None</span>}
            <span className={`badge email-${l.emailCheck.status}`}>{l.emailCheck.status}</span>
            <small className="muted block">{l.emailCheck.notes.join(". ")}</small>
            {!l.email && e?.emailsFound.length ? <small className="block">Found on site: {e.emailsFound.join(", ")}</small> : null}
          </dd>
          <dt>Phone</dt>
          <dd>{phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a> : <span className="muted">None found</span>}</dd>
          {e?.socials.linkedin && (
            <>
              <dt>LinkedIn</dt>
              <dd>
                <a href={e.socials.linkedin} target="_blank" rel="noreferrer noopener">
                  Company page
                </a>
              </dd>
            </>
          )}
        </dl>
      </section>

      <section className="drawer-section">
        <h3>From their website</h3>
        {e?.reachable ? (
          <dl className="facts">
            {e.title && (
              <>
                <dt>Headline</dt>
                <dd>{e.title}</dd>
              </>
            )}
            {e.description && (
              <>
                <dt>About</dt>
                <dd>{e.description}</dd>
              </>
            )}
            <dt>Last updated</dt>
            <dd>{e.copyrightYear ? `Around ${e.copyrightYear} (footer copyright)` : "Unknown"}</dd>
            <dt>Built with</dt>
            <dd>{e.tech.length ? e.tech.join(", ") : "Nothing we recognise"}</dd>
            <dt>Signals</dt>
            <dd>
              {[e.hasCareersPage && "Hiring", e.hasBlog && "Blog or news", e.hasEcommerce && "Sells online", e.hasChatWidget && "Live chat", !e.https && "No HTTPS"].filter(Boolean).join(", ") || "None"}
            </dd>
          </dl>
        ) : (
          <p className="muted">{e?.error ?? (l.domain ? "Not checked" : "No website in the list")}</p>
        )}
      </section>
    </aside>
  );
}
