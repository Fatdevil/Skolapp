-- GDPR baseline schema updates

-- Consent & erase markers on users
alter table users add column if not exists privacy_consent_version int;
alter table users add column if not exists privacy_consent_at timestamptz;
alter table users add column if not exists erase_requested_at timestamptz;

-- Optional soft-delete flag for users (if not present)
alter table users add column if not exists deleted boolean default false;

-- GDPR erase queue
create table if not exists gdpr_erase_queue (
  id bigserial primary key,
  user_id text not null references users(id),
  requested_at timestamptz not null default now(),
  forced boolean not null default false,
  processed_at timestamptz
);
create index if not exists gdpr_erase_queue_user_id_idx on gdpr_erase_queue(user_id);
create index if not exists gdpr_erase_queue_processed_at_idx on gdpr_erase_queue(processed_at);

-- Soft delete on messages/events
alter table messages add column if not exists deleted_at timestamptz;
alter table events add column if not exists deleted_at timestamptz;

-- Track creator on events for erase handling
alter table events add column if not exists created_by text;

-- Index for retention/erase
create index if not exists messages_deleted_at_idx on messages(deleted_at);
create index if not exists events_deleted_at_idx on events(deleted_at);
create index if not exists messages_sender_id_idx on messages(sender_id);
create index if not exists events_created_by_idx on events(created_by);

-- Device ownership for erase
alter table devices add column if not exists user_id text references users(id);
create index if not exists devices_user_id_idx on devices(user_id);

-- Encrypted push token storage columns
alter table devices add column if not exists expo_token_iv text;
alter table devices add column if not exists expo_token_tag text;
