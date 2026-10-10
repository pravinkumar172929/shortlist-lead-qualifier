"use client";

import { useRef, useState } from "react";

interface Props {
  onFile: (text: string, fileName: string) => void;
  onDomains: (domains: string[]) => void;
  onSample: () => void;
}

export default function ImportScreen({ onFile, onDomains, onSample }: Props) {
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError(`${file.name} isn't a CSV. Export your list as .csv and drop it here.`);
      return;
    }
    setError(null);
    onFile(await file.text(), file.name);
  };

  const domains = pasted
    .split(/[\s,;]+/)
    .map((d) => d.trim())
    .filter((d) => /\.[a-z]{2,}/i.test(d));

  return (
    <div className="import">
      <section className="import-intro">
        <h1>Turn a scraped lead list into this week&rsquo;s call list.</h1>
        <p>
          Drop in an export from SaaSquatch or any CRM. Shortlist merges duplicates, checks every email, reads each company&rsquo;s
          website, and ranks the list against your ideal customer, with the reason behind every score.
        </p>
        <ol className="steps">
          <li>
            <span><strong>Import</strong> a CSV or paste domains</span>
          </li>
          <li>
            <span><strong>Check</strong> emails and company websites</span>
          </li>
          <li>
            <span><strong>Rank and export</strong> to CSV or HubSpot</span>
          </li>
        </ol>
      </section>

      <section className="import-actions" aria-label="Add leads">
        <div
          className={`dropzone${dragging ? " is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            readFile(e.dataTransfer.files[0]);
          }}
        >
          <p className="dropzone-title">Drop a CSV here</p>
          <p className="muted">Any column order. We&rsquo;ll match the headers for you.</p>
          <button className="btn primary" onClick={() => input.current?.click()}>
            Choose a file
          </button>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => readFile(e.target.files?.[0])} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="paste">
          <label htmlFor="domains">Or paste company websites</label>
          <textarea
            id="domains"
            rows={4}
            placeholder={"acmeplumbing.com\nhttps://www.ridgewayhvac.com"}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button className="btn" disabled={domains.length === 0} onClick={() => onDomains(domains)}>
            {domains.length ? `Check ${domains.length} website${domains.length === 1 ? "" : "s"}` : "Check websites"}
          </button>
        </div>

        <button className="sample-link" onClick={onSample}>
          No list handy? Try a sample list of fictional companies.
        </button>
      </section>
    </div>
  );
}
