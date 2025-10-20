alter table invitations
  add column if not exists role text
  check (role in ('guardian','teacher','admin'))
  default 'guardian';
