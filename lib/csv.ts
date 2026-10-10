// Small RFC 4180 CSV parser/serializer. Handles quoted fields, escaped quotes,
// CRLF line endings and a UTF-8 BOM, which covers exports from SaaSquatch,
// Apollo, HubSpot, Excel and Google Sheets.

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const src = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const rows = nonEmpty.slice(1).map((r) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (r[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @ at the start of a cell).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(headers.map((h) => escapeCell(row[h])).join(","));
  return lines.join("\r\n");
}
