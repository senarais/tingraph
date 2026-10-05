alter table ops.payment_orders drop constraint payment_orders_method_check;
alter table ops.payment_orders add constraint payment_orders_method_check
  check (method in ('gopay', 'qris', 'paypal', 'card'));
alter table ops.payment_orders drop constraint payment_orders_provider_method_check;
alter table ops.payment_orders add constraint payment_orders_provider_method_check
  check ((provider = 'paypal' and method in ('paypal', 'card'))
    or (provider = 'midtrans' and method in ('qris', 'gopay', 'card')));

create table ops.card_subscriptions (
  id uuid primary key references ops.payment_orders(id),
  user_id uuid not null references auth.users(id),
  provider_id text unique check (char_length(provider_id) between 1 and 64),
  plan_id text check (char_length(plan_id) between 1 and 64),
  status text not null default 'CREATING' check (status in
    ('CREATING', 'APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'FAILED')),
  amount bigint not null check (amount > 0),
  tax_cents integer not null check (tax_cents >= 0),
  fee bigint not null check (fee >= 0),
  first_payment_id text check (char_length(first_payment_id) between 1 and 50),
  consent_version text not null check (char_length(consent_version) between 1 and 32),
  consented_at timestamptz not null default now(),
  cancel_requested boolean not null default false,
  next_billing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index card_subscriptions_one_live_user on ops.card_subscriptions(user_id)
  where status not in ('CANCELLED', 'EXPIRED', 'FAILED') and not cancel_requested;
create index card_subscriptions_reconcile_idx on ops.card_subscriptions(updated_at)
  where status not in ('CANCELLED', 'EXPIRED', 'FAILED');
grant select, insert, update (provider_id, plan_id, status, next_billing_at, updated_at, cancel_requested)
  on ops.card_subscriptions to tingraph_app;

alter table ops.payment_orders add column subscription_id uuid references ops.card_subscriptions(id);
alter table ops.payment_orders add column snap_token text check (char_length(snap_token) between 1 and 128);
grant update (subscription_id) on ops.payment_orders to tingraph_app;
grant update (snap_token) on ops.payment_orders to tingraph_app;

-- Serialize the subscription ledger. A provider transaction is credited exactly once,
-- regardless of duplicate callbacks, browser returns, reconciliation or refunds.
create function ops.settle_subscription_payment(p_subscription uuid, p_payment_id text,
  p_amount bigint, p_paid_at timestamptz, p_refund boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  sub ops.card_subscriptions%rowtype;
  initial ops.payment_orders%rowtype;
  purchase ops.payment_orders%rowtype;
  v_first boolean;
  v_changed boolean;
begin
  select * into sub from ops.card_subscriptions where id = p_subscription for update;
  if not found or sub.provider_id is null or p_payment_id is null or p_payment_id = ''
    or char_length(p_payment_id) > 50 or p_paid_at is null or p_paid_at > now() + interval '1 minute'
    or p_paid_at < sub.created_at - interval '1 minute' then
    raise exception 'subscription_payment_mismatch';
  end if;
  select * into initial from ops.payment_orders where id = sub.id;
  if initial.user_id <> sub.user_id or initial.provider <> 'paypal' or initial.method <> 'card'
    or initial.currency <> 'USD' then raise exception 'subscription_payment_mismatch'; end if;
  v_first := sub.first_payment_id is null or sub.first_payment_id = p_payment_id;
  if p_amount <> (case when v_first then initial.amount else sub.amount end) then
    raise exception 'subscription_amount_mismatch';
  end if;
  select * into purchase from ops.payment_orders where payment_id = p_payment_id for update;
  if found then
    if purchase.subscription_id is distinct from sub.id or purchase.amount <> p_amount then
      raise exception 'subscription_payment_mismatch';
    end if;
  elsif v_first then
    update ops.card_subscriptions set first_payment_id = p_payment_id where id = sub.id;
    update ops.payment_orders set provider_id = sub.provider_id, subscription_id = sub.id
      where id = sub.id and (provider_id is null or provider_id = sub.provider_id)
      returning * into purchase;
    if not found then raise exception 'subscription_payment_mismatch'; end if;
  else
    insert into ops.payment_orders (user_id, provider, currency, amount, method, provider_id,
      base_cents, tax_cents, fee, time_zone, subscription_id, created_at)
    values (sub.user_id, 'paypal', 'USD', sub.amount, 'card', sub.provider_id || ':' || p_payment_id,
      500, sub.tax_cents, sub.fee, initial.time_zone, sub.id, p_paid_at)
    returning * into purchase;
  end if;
  v_changed := ops.settle_payment(purchase.id, 'paypal', purchase.provider_id, p_payment_id, 'USD', p_amount, p_refund);
  if v_changed and not p_refund then
    update ops.payment_orders set paid_at = p_paid_at where id = purchase.id;
    perform ops.refresh_premium(sub.user_id);
  end if;
  return v_changed;
end;
$$;
revoke all on function ops.settle_subscription_payment(uuid, text, bigint, timestamptz, boolean) from public;
grant execute on function ops.settle_subscription_payment(uuid, text, bigint, timestamptz, boolean) to tingraph_app;
