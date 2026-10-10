// Key/value cache with a TTL. Uses Supabase Postgres (via its REST API, so no
// SDK dependency) when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, and
// an in-process Map otherwise. The Map survives between requests while a
// serverless instance stays warm, which is enough for local dev and demos.

const DAY_MS = 24 * 60 * 60 * 1000;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const memory: Map<string, Entry> =
  ((globalThis as Record<string, unknown>).__shortlistCache as Map<string, Entry>) ??
  ((globalThis as Record<string, unknown>).__shortlistCache = new Map<string, Entry>());

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    endpoint: `${url.replace(/\/$/, "")}/rest/v1/cache_entries`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}

export const cacheBackend = (): "supabase" | "memory" => (supabase() ? "supabase" : "memory");

export async function cacheGet<T>(key: string): Promise<T | null> {
  const hit = memory.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const sb = supabase();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.endpoint}?key=eq.${encodeURIComponent(key)}&select=value,expires_at`, {
      headers: sb.headers,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ value: T; expires_at: string }>;
    const row = rows[0];
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
    memory.set(key, { value: row.value, expiresAt: new Date(row.expires_at).getTime() });
    return row.value;
  } catch {
    return null; // A cache miss must never break enrichment.
  }
}

export async function cacheSet(key: string, value: unknown, ttlDays = 7): Promise<void> {
  const expiresAt = Date.now() + ttlDays * DAY_MS;
  memory.set(key, { value, expiresAt });

  const sb = supabase();
  if (!sb) return;
  try {
    await fetch(sb.endpoint, {
      method: "POST",
      headers: { ...sb.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value, expires_at: new Date(expiresAt).toISOString() }),
    });
  } catch {
    /* best effort */
  }
}
