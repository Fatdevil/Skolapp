create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  revoked boolean not null default false
);

create index if not exists sessions_user_id_idx on sessions(user_id);
