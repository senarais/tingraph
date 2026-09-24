alter table auth.users add column role text not null default 'user' check (role in ('user', 'admin'));

create extension if not exists pg_trgm;
create index users_created_idx on auth.users (created_at desc, id desc);
create index users_email_search_idx on auth.users using gin ((email::text) gin_trgm_ops);
create index profiles_username_search_idx on app.profiles using gin (username gin_trgm_ops);
create index payment_orders_created_idx on ops.payment_orders (created_at desc, id desc);
create index payment_orders_paid_idx on ops.payment_orders (paid_at desc) include (currency, amount)
  where status = 'paid';

create table ops.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  target_id uuid,
  target_email citext not null,
  action text not null check (action in ('create', 'update', 'password', 'delete')),
  created_at timestamptz not null default now()
);
create index admin_audit_target_idx on ops.admin_audit (target_id, created_at desc);

grant update (email, role, disabled_at) on auth.users to tingraph_app;
grant delete on auth.users to tingraph_app;
grant update (tier, premium_until) on app.profiles to tingraph_app;
grant select, insert on ops.admin_audit to tingraph_app;
