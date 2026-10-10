import type { Signal, Tier } from "@/lib/types";

/**
 * The fit meter: one cell per scoring signal, each as wide as that signal's
 * weight and filled by how much of it the lead earned. A rep can read which
 * signals carried a score, and which are missing, without opening the lead.
 */
export function FitMeter({ signals, tier, size = "row" }: { signals: Signal[]; tier: Tier; size?: "row" | "large" }) {
  return (
    <span className={`meter meter-${size} tier-${tier}`} role="img" aria-label={signals.map((s) => `${s.label} ${Math.round(s.points)} of ${Math.round(s.max)}`).join(", ")}>
      {signals.map((s) => (
        <span key={s.key} className="meter-cell" style={{ flexGrow: Math.max(s.max, 0.001) }} title={`${s.label}: ${s.detail}`}>
          <span className="meter-fill" style={{ width: `${s.max ? (s.points / s.max) * 100 : 0}%` }} />
        </span>
      ))}
    </span>
  );
}

/** Tiny six-cell glyph marking which position in the meter a signal occupies. */
export function CellGlyph({ index, count = 6 }: { index: number; count?: number }) {
  return (
    <span className="glyph" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={i === index ? "on" : undefined} />
      ))}
    </span>
  );
}
