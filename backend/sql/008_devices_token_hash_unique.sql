-- Lägg unikt index efter att backfill/dedupe körts
create unique index if not exists devices_token_hash_uidx on devices (token_hash);
