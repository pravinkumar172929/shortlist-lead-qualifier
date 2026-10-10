"use client";

import { useState } from "react";
import type { Icp, SignalKey } from "@/lib/types";
import { SIGNAL_LABELS } from "@/lib/score";
import { CellGlyph } from "./FitMeter";

interface Props {
  icp: Icp;
  onChange: (icp: Icp) => void;
  onReset: () => void;
}

const WEIGHT_HELP: Record<SignalKey, string> = {
  industry: "Listed industry or website matches your targets",
  size: "Headcount inside your range",
  decisionMaker: "Contact can sign off",
  reachability: "Verified email, phone, LinkedIn",
  modernization: "Outdated site or missing tools, room to add value",
  activity: "Live site, hiring, active online",
};

function TagInput({ id, label, values, onChange, placeholder }: { id: string; label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length) onChange([...new Set([...values, ...parts])]);
    setDraft("");
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="tags">
        {values.map((v) => (
          <span className="tag" key={v}>
            {v}
            <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  );
}

export default function IcpPanel({ icp, onChange, onReset }: Props) {
  const total = Object.values(icp.weights).reduce((a, b) => a + b, 0) || 1;
  return (
    <aside className="icp" aria-label="Ideal customer profile">
      <div className="icp-head">
        <h2>Ideal customer</h2>
        <button className="link" onClick={onReset}>
          Reset
        </button>
      </div>
      <p className="muted small">Changes re-rank the list instantly.</p>

      <TagInput id="icp-industries" label="Target industries" values={icp.industries} onChange={(industries) => onChange({ ...icp, industries })} placeholder="Add an industry" />

      <div className="field">
        <span className="field-label">Employees</span>
        <div className="range-pair">
          <label className="sr-only" htmlFor="icp-min">
            Minimum employees
          </label>
          <input id="icp-min" type="number" min={0} value={icp.minEmployees} onChange={(e) => onChange({ ...icp, minEmployees: Math.max(0, Number(e.target.value)) })} />
          <span aria-hidden>to</span>
          <label className="sr-only" htmlFor="icp-max">
            Maximum employees
          </label>
          <input id="icp-max" type="number" min={0} value={icp.maxEmployees} onChange={(e) => onChange({ ...icp, maxEmployees: Math.max(0, Number(e.target.value)) })} />
        </div>
      </div>

      <TagInput
        id="icp-titles"
        label="Decision-maker titles"
        values={icp.decisionMakerTitles}
        onChange={(decisionMakerTitles) => onChange({ ...icp, decisionMakerTitles })}
        placeholder="Add a title"
      />

      <fieldset className="weights">
        <legend>What matters most</legend>
        {(Object.keys(icp.weights) as SignalKey[]).map((k, i) => (
          <div className="weight" key={k}>
            <div className="weight-label">
              <label htmlFor={`w-${k}`}>
                <CellGlyph index={i} />
                {SIGNAL_LABELS[k]}
              </label>
              <output htmlFor={`w-${k}`}>{Math.round((icp.weights[k] / total) * 100)}%</output>
            </div>
            <input
              id={`w-${k}`}
              type="range"
              min={0}
              max={40}
              step={1}
              value={icp.weights[k]}
              aria-describedby={`w-${k}-help`}
              onChange={(e) => onChange({ ...icp, weights: { ...icp.weights, [k]: Number(e.target.value) } })}
            />
            <small id={`w-${k}-help`}>{WEIGHT_HELP[k]}</small>
          </div>
        ))}
      </fieldset>
    </aside>
  );
}
