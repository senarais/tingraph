create table auth.legal_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  policy_version text not null check (policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at timestamptz not null default now(),
  method text not null check (method in ('email', 'google')),
  primary key (user_id, policy_version)
);

alter table auth.oauth_transactions add column legal_version text
  check (legal_version is null or legal_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

grant select, insert on auth.legal_acceptances to tingraph_app;
