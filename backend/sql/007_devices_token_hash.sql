-- 1) Lägg kolumn för deterministisk indexering
alter table devices add column if not exists token_hash text;
alter table devices add column if not exists last_seen_at timestamptz;

-- 2) (Skapas senare när backfill + dedupe är klar)
-- create unique index if not exists devices_token_hash_uidx on devices (token_hash);
