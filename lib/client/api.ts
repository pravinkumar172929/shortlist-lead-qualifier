"use client";

import type { EmailCheck, Enrichment, EnrichResult, Insight, Lead, ScoredLead } from "../types";
import { rulesInsight } from "../insights";

export const BATCH_SIZE = 6;
const PARALLEL_REQUESTS = 2;

export interface Health {
  cache: "supabase" | "memory";
  ai: boolean;
}

export async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch("/api/health");
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}

/**
 * Enriches leads in small batches, a couple of requests at a time, calling
 * `onBatch` as each one lands so the table fills in progressively. Small
 * batches keep every request far inside a serverless time limit.
 */
export async function enrichAll(leads: Lead[], onBatch: (results: EnrichResult[]) => void, signal?: AbortSignal): Promise<void> {
  const batches: Lead[][] = [];
  for (let i = 0; i < leads.length; i += BATCH_SIZE) batches.push(leads.slice(i, i + BATCH_SIZE));
  let next = 0;

  const worker = async () => {
    while (next < batches.length && !signal?.aborted) {
      const batch = batches[next++];
      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: batch.map((l) => ({ id: l.id, domain: l.domain, email: l.email })) }),
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        onBatch(((await res.json()) as { results: EnrichResult[] }).results);
      } catch (err) {
        if (signal?.aborted) return;
        // Keep going: mark this batch as checked-but-unknown instead of stalling the run.
        onBatch(
          batch.map((l) => ({
            id: l.id,
            emailCheck: { status: l.email ? "risky" : "missing", notes: ["Could not verify right now"], hasMx: null },
            enrichment: null,
          })),
        );
        console.warn("Enrichment batch failed", err);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL_REQUESTS }, worker));
}

interface DemoFixture {
  sites: Record<string, Enrichment>;
  emails: Record<string, EmailCheck>;
}

/** The bundled sample list ships with a frozen enrichment snapshot so the demo works offline. */
export async function demoResults(leads: Lead[]): Promise<EnrichResult[]> {
  const fx = (await (await fetch("/demo/sample-enrichment.json")).json()) as DemoFixture;
  return leads.map((l) => ({
    id: l.id,
    emailCheck: fx.emails[l.email] ?? { status: "missing", notes: ["No email on file"], hasMx: null },
    enrichment: fx.sites[l.domain] ?? null,
  }));
}

export async function fetchInsight(lead: ScoredLead): Promise<Insight> {
  try {
    const res = await fetch("/api/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead: { ...lead, raw: {} } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Insight;
  } catch {
    return rulesInsight(lead);
  }
}

export function download(filename: string, text: string) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const storage = {
  get<T>(key: string): T | null {
    try {
      const v = window.localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode or quota: preferences just won't persist */
    }
  },
};
