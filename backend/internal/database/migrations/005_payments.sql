alter table app.profiles add column premium_until timestamptz;

create table ops.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  provider text not null check (provider in ('midtrans', 'paypal')),
  currency text not null check (currency in ('IDR', 'USD')),
  amount bigint not null check (amount > 0),
  rate_date date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  provider_id text unique check (char_length(provider_id) <= 128),
  payment_id text unique check (char_length(payment_id) <= 128),
  checkout_url text check (char_length(checkout_url) <= 2048),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  check ((provider = 'midtrans' and currency = 'IDR' and rate_date is not null)
      or (provider = 'paypal' and currency = 'USD' and amount = 500 and rate_date is null))
);

create index payment_orders_user_idx on ops.payment_orders (user_id, created_at desc);
grant select, insert, update (provider_id, checkout_url) on ops.payment_orders to tingraph_app;

create function ops.settle_payment(p_order uuid, p_provider text, p_provider_id text,
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
    raise exception using errcode = '22023', message = 'payment_mismatch';
  end if;
  if p_refund then
    if purchase.status = 'refunded' then return false; end if;
    if purchase.status = 'pending' and p_payment_id is not null and p_payment_id <> '' then
      update ops.payment_orders set status = 'refunded', provider_id = p_provider_id,
        payment_id = p_payment_id, refunded_at = now() where id = p_order;
      return true;
    end if;
    if purchase.status <> 'paid' or purchase.payment_id is distinct from p_payment_id then
      raise exception using errcode = '22023', message = 'refund_mismatch';
    end if;
    update ops.payment_orders set status = 'refunded', refunded_at = now() where id = p_order;
  else
    if purchase.status in ('paid', 'refunded', 'failed') then return false; end if;
    if p_payment_id is null or p_payment_id = '' then
      raise exception using errcode = '22023', message = 'payment_mismatch';
    end if;
    update ops.payment_orders set status = 'paid', provider_id = p_provider_id,
      payment_id = p_payment_id, paid_at = now() where id = p_order;
  end if;

  select tier, premium_until into current_tier, current_until
  from app.profiles where id = purchase.user_id for update;
  if not found or (current_tier = 'premium' and current_until is null) then
    raise exception using errcode = '22023', message = 'legacy_premium_cannot_be_extended';
  end if;
  for period in
    select paid_at from ops.payment_orders
    where user_id = purchase.user_id and status = 'paid'
    order by paid_at, id
  loop
    new_until := greatest(coalesce(new_until, period.paid_at), period.paid_at) + interval '30 days';
  end loop;
  update app.profiles set tier = case when new_until > now() then 'premium' else 'free' end,
    premium_until = new_until where id = purchase.user_id;
  return true;
end;
$$;

revoke all on function ops.settle_payment(uuid, text, text, text, text, bigint, boolean) from public;
grant execute on function ops.settle_payment(uuid, text, text, text, text, bigint, boolean) to tingraph_app;

create function ops.fail_payment(p_order uuid, p_provider text, p_provider_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  purchase ops.payment_orders%rowtype;
begin
  select * into purchase from ops.payment_orders where id = p_order for update;
  if not found or purchase.provider <> 'midtrans' or purchase.provider <> p_provider
    or p_provider_id is null or p_provider_id = ''
    or (purchase.provider_id is not null and purchase.provider_id <> p_provider_id) then
    raise exception using errcode = '22023', message = 'payment_mismatch';
  end if;
  if purchase.status <> 'pending' then return false; end if;
  update ops.payment_orders set status = 'failed', provider_id = p_provider_id where id = p_order;
  return true;
end;
$$;

revoke all on function ops.fail_payment(uuid, text, text) from public;
grant execute on function ops.fail_payment(uuid, text, text) to tingraph_app;

create or replace function app.enforce_diagram_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_premium boolean;
  v_limit integer;
  v_count integer;
begin
  select p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())
  into v_premium from app.profiles p where p.id = new.user_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'profile_not_found';
  end if;
  v_limit := case when v_premium then 100 else 2 end;
  select count(*) into v_count from app.diagrams d where d.user_id = new.user_id;
  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = 'diagram_limit_reached';
  end if;
  return new;
end;
$$;

create or replace function app.consume_generation(p_user uuid)
returns table (allowed boolean, used integer, usage_limit integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := (now() at time zone 'utc')::date;
  v_premium boolean;
  v_limit integer;
  v_used integer;
begin
  select p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())
  into v_premium from app.profiles p where p.id = p_user;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  v_limit := case when v_premium then null else 10 end;
  insert into app.daily_usage as usage (user_id, usage_date, generations)
  values (p_user, v_date, 1)
  on conflict (user_id, usage_date) do update
    set generations = usage.generations + 1, updated_at = now()
    where v_limit is null or usage.generations < v_limit
  returning generations into v_used;
  if not found then
    select usage.generations into v_used
    from app.daily_usage usage
    where usage.user_id = p_user and usage.usage_date = v_date;
    return query select false, v_used, v_limit;
    return;
  end if;
  return query select true, v_used, v_limit;
end;
$$;

create or replace function app.reserve_ai_tokens(p_user uuid, p_tokens integer)
returns table (reservation_id uuid, allowed boolean, remaining bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := (now() at time zone 'utc')::date;
  v_premium boolean;
  v_limit bigint;
  v_used bigint;
  v_reserved bigint;
  v_released bigint;
  v_id uuid;
begin
  if p_tokens is null or p_tokens <= 0 then
    raise exception using errcode = '22023', message = 'invalid_token_reservation';
  end if;
  select p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())
  into v_premium from app.profiles p where p.id = p_user;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  v_limit := case when v_premium then 100000::bigint else 2000::bigint end;
  insert into app.daily_usage as usage (user_id, usage_date)
  values (p_user, v_date)
  on conflict (user_id, usage_date) do update set updated_at = now()
  returning ai_tokens, ai_reserved into v_used, v_reserved;
  with expired as (
    update app.ai_token_reservations reservation set settled_at = now()
    where reservation.user_id = p_user
      and reservation.usage_date = v_date
      and reservation.settled_at is null
      and reservation.expires_at <= now()
    returning reservation.reserved_tokens
  )
  select coalesce(sum(expired.reserved_tokens), 0) into v_released from expired;
  if v_released > 0 then
    update app.daily_usage usage
    set ai_reserved = greatest(usage.ai_reserved - v_released, 0), updated_at = now()
    where usage.user_id = p_user and usage.usage_date = v_date
    returning usage.ai_tokens, usage.ai_reserved into v_used, v_reserved;
  end if;
  if v_used + v_reserved + p_tokens > v_limit then
    return query select null::uuid, false, greatest(v_limit - v_used - v_reserved, 0);
    return;
  end if;
  v_id := gen_random_uuid();
  insert into app.ai_token_reservations (id, user_id, usage_date, reserved_tokens)
  values (v_id, p_user, v_date, p_tokens);
  update app.daily_usage usage
  set ai_reserved = usage.ai_reserved + p_tokens, updated_at = now()
  where usage.user_id = p_user and usage.usage_date = v_date;
  return query select v_id, true, greatest(v_limit - v_used - v_reserved - p_tokens, 0);
end;
$$;

create or replace function app.settle_ai_tokens(p_user uuid, p_reservation_id uuid, p_tokens integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_date date;
  v_owner uuid;
  v_premium boolean;
  v_limit bigint;
  v_reserved integer;
  v_remaining bigint;
begin
  if p_reservation_id is null or p_tokens is null or p_tokens < 0 then
    raise exception using errcode = '22023', message = 'invalid_token_settlement';
  end if;
  select reservation.user_id, reservation.usage_date into v_owner, v_date
  from app.ai_token_reservations reservation where reservation.id = p_reservation_id;
  if not found or v_owner <> p_user then
    raise exception using errcode = '42501', message = 'invalid_token_reservation';
  end if;
  select p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())
  into v_premium from app.profiles p where p.id = p_user;
  v_limit := case when v_premium then 100000::bigint else 2000::bigint end;
  update app.daily_usage usage set updated_at = now()
  where usage.user_id = p_user and usage.usage_date = v_date;
  update app.ai_token_reservations reservation set settled_at = now()
  where reservation.id = p_reservation_id
    and reservation.user_id = p_user
    and reservation.settled_at is null
  returning reservation.reserved_tokens into v_reserved;
  if not found then
    select greatest(v_limit - usage.ai_tokens - usage.ai_reserved, 0) into v_remaining
    from app.daily_usage usage where usage.user_id = p_user and usage.usage_date = v_date;
    return coalesce(v_remaining, 0);
  end if;
  update app.daily_usage usage
  set ai_reserved = greatest(usage.ai_reserved - v_reserved, 0),
      ai_tokens = usage.ai_tokens + least(p_tokens, v_reserved),
      updated_at = now()
  where usage.user_id = p_user and usage.usage_date = v_date
  returning greatest(v_limit - usage.ai_tokens - usage.ai_reserved, 0) into v_remaining;
  return v_remaining;
end;
$$;
