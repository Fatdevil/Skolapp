create table if not exists audit_logs (
  id bigserial primary key,
  actor_user_id text,
  action text not null,
  target_user_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_idx on audit_logs(action);
