create schema ops;
revoke all on schema ops from public;

create table ops.email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient citext not null check (char_length(recipient) between 3 and 320),
  template text not null check (template in ('verify_email', 'reset_password', 'password_changed')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  created_at timestamptz not null default now()
);

create index email_outbox_pending_idx
  on ops.email_outbox (available_at, created_at)
  where sent_at is null;

grant usage on schema auth, app, ops to tingraph_app;

grant select, insert, update on auth.users to tingraph_app;
grant select, insert, update on auth.password_credentials to tingraph_app;
grant select, insert, update on auth.oauth_accounts to tingraph_app;
grant select, insert, update, delete on auth.sessions to tingraph_app;
grant select, insert, update, delete on auth.one_time_tokens to tingraph_app;
grant select, insert, update, delete on auth.oauth_transactions to tingraph_app;
grant select, insert, update, delete on auth.rate_limits to tingraph_app;

grant select, update on app.profiles to tingraph_app;
grant select, insert, update, delete on app.diagrams to tingraph_app;
grant select, insert, update on app.daily_usage to tingraph_app;
grant select, insert, update on app.ai_token_reservations to tingraph_app;

grant select, insert, update on ops.email_outbox to tingraph_app;

grant execute on function app.consume_generation(uuid) to tingraph_app;
grant execute on function app.reserve_ai_tokens(uuid, integer) to tingraph_app;
grant execute on function app.settle_ai_tokens(uuid, uuid, integer) to tingraph_app;
