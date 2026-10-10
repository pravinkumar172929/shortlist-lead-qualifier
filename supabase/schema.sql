-- Shortlist cache. One table, keyed by a namespaced string:
--   site:<domain>              homepage enrichment (7-day TTL, 1 day for failures)
--   mx:<domain>                MX lookup result (7 days)
--   insight:<domain>:<email>:<score>  AI note and opener (7 days)
-- The server writes with the service-role key; nothing is exposed to browsers.

create table if not exists public.cache_entries (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);

create index if not exists cache_entries_expires_at_idx on public.cache_entries (expires_at);

alter table public.cache_entries enable row level security;
-- No policies: only the service role (which bypasses RLS) can read or write.

-- Optional housekeeping, e.g. from a daily Supabase cron job:
-- delete from public.cache_entries where expires_at < now();
