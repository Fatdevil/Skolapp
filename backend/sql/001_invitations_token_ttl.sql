alter table invitations add column if not exists expires_at timestamptz;
alter table invitations add column if not exists used_at timestamptz;
create index if not exists invitations_token_idx on invitations(token);
update invitations set expires_at = coalesce(expires_at, created_at + interval '15 minutes')
where expires_at is null;
