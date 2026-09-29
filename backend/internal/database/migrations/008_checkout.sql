create table ops.discount_codes (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,32}$'),
  percent integer not null check (percent between 1 and 99),
  max_uses integer not null check (max_uses between 1 and 1000000),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert on ops.discount_codes to tingraph_app;

alter table ops.payment_orders drop constraint payment_orders_check;
alter table ops.payment_orders add constraint payment_orders_provider_currency_check check
  ((provider = 'midtrans' and currency = 'IDR' and rate_date is not null)
   or (provider = 'paypal' and currency = 'USD' and rate_date is null));
alter table ops.payment_orders add column method text not null default 'paypal'
  check (method in ('gopay', 'qris', 'paypal'));
update ops.payment_orders set method = 'qris' where provider = 'midtrans';
alter table ops.payment_orders add column discount_code text references ops.discount_codes(code);
alter table ops.payment_orders add column base_cents integer not null default 500 check (base_cents between 1 and 500);
alter table ops.payment_orders add column tax_cents integer not null default 0 check (tax_cents >= 0);
alter table ops.payment_orders add column idr_base bigint check (idr_base > 0);
alter table ops.payment_orders add column fee bigint not null default 0 check (fee >= 0);
alter table ops.payment_orders add column deeplink_url text check (char_length(deeplink_url) <= 2048);
alter table ops.payment_orders add column expires_at timestamptz not null default (now() + interval '24 hours');
update ops.payment_orders set expires_at = created_at + interval '24 hours';
alter table ops.payment_orders drop constraint payment_orders_status_check;
alter table ops.payment_orders add constraint payment_orders_status_check
  check (status in ('pending', 'paid', 'refunded', 'failed', 'expired'));
alter table ops.payment_orders add constraint payment_orders_provider_method_check
  check ((provider = 'paypal' and method = 'paypal') or (provider = 'midtrans' and method in ('qris', 'gopay')));
create index payment_orders_reserved_idx on ops.payment_orders (discount_code, status, expires_at)
  where discount_code is not null;
create index payment_orders_expiry_idx on ops.payment_orders (expires_at)
  where status = 'pending';
grant insert (method, discount_code, base_cents, tax_cents, idr_base, fee, expires_at) on ops.payment_orders to tingraph_app;
grant update (status) on ops.payment_orders to tingraph_app;
grant update (deeplink_url) on ops.payment_orders to tingraph_app;

-- Lock code before counting: two simultaneous checkouts cannot reserve last slot twice.
create function ops.reserve_discount(p_order uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_code ops.discount_codes%rowtype;
begin
  select * into v_code from ops.discount_codes where code = p_code for update;
  if not found or not v_code.enabled then return false; end if;
  update ops.payment_orders set status = 'expired'
    where discount_code = p_code and status = 'pending' and expires_at <= now()
      and provider_id is null;
  if (select count(*) from ops.payment_orders where discount_code = p_code
      and status in ('paid', 'pending')) >= v_code.max_uses then return false; end if;
  update ops.payment_orders set discount_code = p_code where id = p_order and status = 'pending';
  return found;
end;
$$;
revoke all on function ops.reserve_discount(uuid, text) from public;
grant execute on function ops.reserve_discount(uuid, text) to tingraph_app;

-- Worker and read paths reap abandoned transactions even when a browser never returns.
create function ops.expire_payments()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update ops.payment_orders set status = 'expired'
    where status = 'pending' and expires_at <= now() and provider_id is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function ops.expire_payments() from public;
grant execute on function ops.expire_payments() to tingraph_app;

create function ops.expire_confirmed_payment(p_order uuid, p_provider_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  select discount_code into v_code from ops.payment_orders where id = p_order;
  if not found then raise exception 'payment_not_found'; end if;
  if v_code is not null then
    perform 1 from ops.discount_codes where code = v_code for update;
  end if;
  update ops.payment_orders set status = 'expired'
    where id = p_order and status = 'pending' and provider_id = p_provider_id;
  return found;
end;
$$;
revoke all on function ops.expire_confirmed_payment(uuid, text) from public;
grant execute on function ops.expire_confirmed_payment(uuid, text) to tingraph_app;

alter table ops.admin_audit drop constraint admin_audit_action_check;
alter table ops.admin_audit add constraint admin_audit_action_check
  check (action in ('create', 'update', 'password', 'delete', 'discount_create'));

-- A verified payment can arrive after a delayed webhook even if the cleanup
-- already marked its order expired. Never keep money without granting access.
create or replace function ops.settle_payment(p_order uuid, p_provider text, p_provider_id text,
  p_payment_id text, p_currency text, p_amount bigint, p_refund boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  purchase ops.payment_orders%rowtype;
  current_tier text;
  current_until timestamptz;
  period record;
  new_until timestamptz;
begin
  select * into purchase from ops.payment_orders where id = p_order for update;
  if not found or purchase.provider <> p_provider or purchase.currency <> p_currency
    or purchase.amount <> p_amount or p_provider_id is null or p_provider_id = ''
    or (purchase.provider_id is not null and purchase.provider_id <> p_provider_id) then
    raise exception 'payment_mismatch';
  end if;
  if p_refund then
    if purchase.status = 'refunded' then return false; end if;
    if purchase.status in ('pending', 'expired') and p_payment_id is not null and p_payment_id <> '' then
      update ops.payment_orders set status = 'refunded', provider_id = p_provider_id,
        payment_id = p_payment_id, refunded_at = now() where id = p_order;
      return true;
    end if;
    if purchase.status <> 'paid' or purchase.payment_id is distinct from p_payment_id then
      raise exception 'refund_mismatch';
    end if;
    update ops.payment_orders set status = 'refunded', refunded_at = now() where id = p_order;
  else
    if purchase.status in ('paid', 'refunded', 'failed') then return false; end if;
    if p_payment_id is null or p_payment_id = '' then raise exception 'payment_mismatch'; end if;
    update ops.payment_orders set status = 'paid', provider_id = p_provider_id,
      payment_id = p_payment_id, paid_at = now() where id = p_order;
  end if;
  select tier, premium_until into current_tier, current_until
    from app.profiles where id = purchase.user_id for update;
  if not found or (current_tier = 'premium' and current_until is null) then
    raise exception 'legacy_premium_cannot_be_extended';
  end if;
  for period in select paid_at from ops.payment_orders
    where user_id = purchase.user_id and status = 'paid' order by paid_at, id loop
    new_until := greatest(coalesce(new_until, period.paid_at), period.paid_at) + interval '30 days';
  end loop;
  update app.profiles set tier = case when new_until > now() then 'premium' else 'free' end,
    premium_until = new_until where id = purchase.user_id;
  return true;
end;
$$;
