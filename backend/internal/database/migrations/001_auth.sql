create extension if not exists citext;
create extension if not exists pgcrypto;

revoke create on schema public from public;

create schema auth;
revoke all on schema auth from public;

create function auth.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique check (
    email = btrim(email)
    and char_length(email) between 3 and 320
  ),
  email_verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_touch_updated_at
before update on auth.users
for each row execute function auth.touch_updated_at();

create table auth.password_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  password_hash text not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create trigger password_credentials_touch_updated_at
before update on auth.password_credentials
for each row execute function auth.touch_updated_at();

create table auth.oauth_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google')),
  provider_subject text not null check (char_length(provider_subject) between 1 and 255),
  provider_email citext,
  created_at timestamptz not null default now(),
  primary key (provider, provider_subject),
  unique (user_id, provider)
);

create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  credential_version bigint,
  created_at timestamptz not null default now(),
  authenticated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip inet,
  user_agent text check (char_length(user_agent) <= 500)
);

create index sessions_user_active_idx
  on auth.sessions (user_id, expires_at)
  where revoked_at is null;

create index sessions_expiry_idx
  on auth.sessions (expires_at)
  where revoked_at is null;

create table auth.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index one_time_tokens_active_idx
  on auth.one_time_tokens (user_id, purpose, expires_at)
  where used_at is null;

create table auth.oauth_transactions (
  id uuid primary key default gen_random_uuid(),
  state_hash bytea not null unique check (octet_length(state_hash) = 32),
  browser_hash bytea not null check (octet_length(browser_hash) = 32),
  nonce text not null check (char_length(nonce) between 32 and 128),
  pkce_verifier text not null check (char_length(pkce_verifier) between 43 and 128),
  next_path text not null check (left(next_path, 1) = '/' and char_length(next_path) <= 2048),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index oauth_transactions_expiry_idx on auth.oauth_transactions (expires_at);

create table auth.rate_limits (
  scope text not null check (char_length(scope) between 1 and 40),
  key_hash bytea not null check (octet_length(key_hash) = 32),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (scope, key_hash)
);
