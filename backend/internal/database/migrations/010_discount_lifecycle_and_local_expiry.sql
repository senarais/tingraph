-- Keep historical order references when a code is removed from the dashboard.
alter table ops.discount_codes add column deleted_at timestamptz;
grant update (enabled, deleted_at) on ops.discount_codes to tingraph_app;

alter table ops.admin_audit drop constraint admin_audit_action_check;
alter table ops.admin_audit add constraint admin_audit_action_check
  check (action in ('create', 'update', 'password', 'delete',
    'discount_create', 'discount_update', 'discount_delete'));
alter table ops.admin_audit add column details text check (char_length(details) <= 64);

-- Payment timezone is immutable. Pre-existing payments have no recorded zone;
-- their owner's first reported browser timezone supplies the fallback.
alter table app.profiles add column time_zone text check (char_length(time_zone) between 1 and 64);
alter table ops.payment_orders add column time_zone text check (char_length(time_zone) between 1 and 64);
grant update (time_zone) on app.profiles to tingraph_app;
grant insert (time_zone) on ops.payment_orders to tingraph_app;

create function ops.end_of_local_day(p_instant timestamptz, p_zone text)
returns timestamptz language sql stable set search_path = '' as $$
  select (((p_instant at time zone p_zone)::date +
    case when (p_instant at time zone p_zone)::time = time '00:00' then 0 else 1 end
  )::timestamp at time zone p_zone)
$$;
revoke all on function ops.end_of_local_day(timestamptz, text) from public;
grant execute on function ops.end_of_local_day(timestamptz, text) to tingraph_app;

-- Rebuild prepaid coverage from paid orders. Each first purchase ends at the
-- midnight after its 30th local calendar day; renewals add 30 whole days.
create function ops.refresh_premium(p_user uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  account app.profiles%rowtype;
  purchase record;
  v_until timestamptz;
  v_zone text;
  v_start timestamptz;
  v_days integer;
  v_has_orders boolean := false;
begin
  select * into account from app.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  if account.tier = 'premium' and account.premium_until is null then
    return null; -- legacy perpetual plan; never shorten it
  end if;
  for purchase in
    select paid_at, time_zone from ops.payment_orders
    where user_id = p_user and status = 'paid' order by paid_at, id
  loop
    v_has_orders := true;
    v_zone := coalesce(purchase.time_zone, account.time_zone, 'UTC');
    v_start := greatest(coalesce(v_until, purchase.paid_at), purchase.paid_at);
    v_days := case when v_until is not null and v_until >= purchase.paid_at
      and (v_start at time zone v_zone)::time = time '00:00' then 30 else 31 end;
    v_until := (((v_start at time zone v_zone)::date + v_days)::timestamp at time zone v_zone);
  end loop;
  if not v_has_orders then
    if exists (select 1 from ops.payment_orders where user_id = p_user and paid_at is not null) then
      update app.profiles set tier = 'free', premium_until = null where id = p_user;
      return null; -- all settled purchases were refunded
    end if;
    -- A manual Premium expiry is rounded once, when its user's timezone is first known.
    if account.tier = 'premium' and account.premium_until > now() and account.time_zone is not null then
      v_zone := account.time_zone;
      v_until := ops.end_of_local_day(account.premium_until, v_zone);
      update app.profiles set premium_until = v_until where id = p_user;
      return v_until;
    end if;
    return account.premium_until;
  end if;
  update app.profiles set tier = case when v_until > now() then 'premium' else 'free' end,
    premium_until = v_until where id = p_user;
  return v_until;
end;
$$;
revoke all on function ops.refresh_premium(uuid) from public;
grant execute on function ops.refresh_premium(uuid) to tingraph_app;

create or replace function ops.settle_payment(p_order uuid, p_provider text, p_provider_id text,
  p_payment_id text, p_currency text, p_amount bigint, p_refund boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  purchase ops.payment_orders%rowtype;
  current_tier text;
  current_until timestamptz;
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
  perform ops.refresh_premium(purchase.user_id);
  return true;
end;
$$;
