"use client";

import { useMemo, useState } from "react";
import { detectColumns, type ColumnMap } from "@/lib/normalize";

const FIELDS: Array<{ key: keyof ColumnMap; label: string; hint?: string }> = [
  { key: "company", label: "Company" },
  { key: "website", label: "Website or domain", hint: "Needed to read the company site" },
  { key: "email", label: "Email" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "fullName", label: "Full name", hint: "Used if first and last are missing" },
  { key: "title", label: "Job title" },
  { key: "phone", label: "Phone" },
  { key: "industry", label: "Industry" },
  { key: "employees", label: "Employees" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
];

interface Props {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
  onConfirm: (map: ColumnMap) => void;
  onCancel: () => void;
}

export default function ColumnMapper({ headers, rows, fileName, onConfirm, onCancel }: Props) {
  const detected = useMemo(() => detectColumns(headers), [headers]);
  const [map, setMap] = useState<ColumnMap>(detected);
  const canStart = Boolean(map.website || map.email) && rows.length > 0;
  const sample = rows[0] ?? {};

  if (rows.length === 0) {
    return (
      <div className="mapper">
        <h1>{fileName} has no rows</h1>
        <p className="muted">The file needs a header row and at least one lead.</p>
        <button className="btn" onClick={onCancel}>
          Choose another file
        </button>
      </div>
    );
  }

  return (
    <div className="mapper">
      <h1>Check the columns in {fileName}</h1>
      <p className="muted">
        {rows.length} rows. We matched {Object.values(map).filter(Boolean).length} of your {headers.length} columns. Fix any that look
        wrong; columns you don&rsquo;t map are still kept in the export.
      </p>

      <div className="map-grid" role="table" aria-label="Column mapping">
        <div className="map-row map-head" role="row">
          <span role="columnheader">Field</span>
          <span role="columnheader">Your column</span>
          <span role="columnheader">First row</span>
        </div>
        {FIELDS.map((f) => (
          <div className="map-row" role="row" key={f.key}>
            <label role="cell" htmlFor={`map-${f.key}`}>
              {f.label}
              {f.hint && <small>{f.hint}</small>}
            </label>
            <select
              role="cell"
              id={`map-${f.key}`}
              value={map[f.key] ?? ""}
              onChange={(e) => setMap({ ...map, [f.key]: e.target.value || undefined })}
            >
              <option value="">Not in this file</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span role="cell" className="map-sample">
              {map[f.key] ? sample[map[f.key] as string] || "(blank)" : ""}
            </span>
          </div>
        ))}
      </div>

      {!canStart && <p className="error">Map a website or email column so there&rsquo;s something to check.</p>}
      <div className="mapper-actions">
        <button className="btn ghost" onClick={onCancel}>
          Back
        </button>
        <button className="btn primary" disabled={!canStart} onClick={() => onConfirm(map)}>
          Check {rows.length} leads
        </button>
      </div>
    </div>
  );
}
