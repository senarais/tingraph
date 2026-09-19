-- Daily AI quota counts model output only. Input is capped by the API route
-- before a reservation is made, so it never consumes this allowance.

create or replace function public.get_my_entitlements()
returns table (
  tier text,
  diagram_count bigint,
  diagram_limit integer,
  generation_used integer,
  generation_limit integer,
  ai_tokens_used bigint,
  ai_token_limit bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_date date := (now() at time zone 'utc')::date;
begin
  if v_user is null then
    return;
  end if;

  return query
  select
    p.tier,
    (select count(*) from public.diagrams d where d.user_id = v_user),
    case when p.tier = 'premium' then 100 else 2 end,
    coalesce(u.generations, 0),
    case when p.tier = 'premium' then null else 10 end,
    coalesce(u.ai_tokens, 0),
    case when p.tier = 'premium' then 100000::bigint else 2000::bigint end
  from public.profiles p
  left join private.daily_usage u
    on u.user_id = p.id and u.usage_date = v_date
  where p.id = v_user;
end;
$$;

create or replace function public.reserve_ai_tokens(p_tokens integer)
returns table (reservation_id uuid, allowed boolean, remaining bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_date date := (now() at time zone 'utc')::date;
  v_tier text;
  v_limit bigint;
  v_used bigint;
  v_reserved bigint;
  v_released bigint;
  v_id uuid;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_tokens is null or p_tokens <= 0 then
    raise exception using errcode = '22023', message = 'invalid_token_reservation';
  end if;

  select p.tier into v_tier
  from public.profiles p
  where p.id = v_user;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  v_limit := case when v_tier = 'premium' then 100000::bigint else 2000::bigint end;

  insert into private.daily_usage as usage (user_id, usage_date)
  values (v_user, v_date)
  on conflict (user_id, usage_date) do update
    set updated_at = now()
  returning ai_tokens, ai_reserved into v_used, v_reserved;

  with expired as (
    update private.ai_token_reservations reservation
    set settled_at = now()
    where reservation.user_id = v_user
      and reservation.usage_date = v_date
      and reservation.settled_at is null
      and reservation.expires_at <= now()
    returning reservation.reserved_tokens
  )
  select coalesce(sum(expired.reserved_tokens), 0)
  into v_released
  from expired;

  if v_released > 0 then
    update private.daily_usage usage
    set ai_reserved = greatest(usage.ai_reserved - v_released, 0),
        updated_at = now()
    where usage.user_id = v_user and usage.usage_date = v_date
    returning usage.ai_tokens, usage.ai_reserved into v_used, v_reserved;
  end if;

  if v_used + v_reserved + p_tokens > v_limit then
    return query
      select null::uuid, false, greatest(v_limit - v_used - v_reserved, 0);
    return;
  end if;

  v_id := gen_random_uuid();
  insert into private.ai_token_reservations (
    id,
    user_id,
    usage_date,
    reserved_tokens
  ) values (
    v_id,
    v_user,
    v_date,
    p_tokens
  );

  update private.daily_usage usage
  set ai_reserved = usage.ai_reserved + p_tokens,
      updated_at = now()
  where usage.user_id = v_user and usage.usage_date = v_date;

  return query
    select v_id, true, greatest(v_limit - v_used - v_reserved - p_tokens, 0);
end;
$$;

create or replace function public.settle_ai_tokens(p_reservation_id uuid, p_tokens integer)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_date date;
  v_owner uuid;
  v_tier text;
  v_limit bigint;
  v_reserved integer;
  v_remaining bigint;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_reservation_id is null or p_tokens is null or p_tokens < 0 then
    raise exception using errcode = '22023', message = 'invalid_token_settlement';
  end if;

  select reservation.user_id, reservation.usage_date
  into v_owner, v_date
  from private.ai_token_reservations reservation
  where reservation.id = p_reservation_id;

  if not found or v_owner <> v_user then
    raise exception using errcode = '42501', message = 'invalid_token_reservation';
  end if;

  select p.tier into v_tier
  from public.profiles p
  where p.id = v_user;
  v_limit := case when v_tier = 'premium' then 100000::bigint else 2000::bigint end;

  update private.daily_usage usage
  set updated_at = now()
  where usage.user_id = v_user and usage.usage_date = v_date;

  update private.ai_token_reservations reservation
  set settled_at = now()
  where reservation.id = p_reservation_id
    and reservation.user_id = v_user
    and reservation.settled_at is null
  returning reservation.reserved_tokens into v_reserved;

  if not found then
    select greatest(v_limit - usage.ai_tokens - usage.ai_reserved, 0)
    into v_remaining
    from private.daily_usage usage
    where usage.user_id = v_user and usage.usage_date = v_date;
    return coalesce(v_remaining, 0);
  end if;

  update private.daily_usage usage
  set ai_reserved = greatest(usage.ai_reserved - v_reserved, 0),
      ai_tokens = usage.ai_tokens + least(p_tokens, v_reserved),
      updated_at = now()
  where usage.user_id = v_user and usage.usage_date = v_date
  returning greatest(v_limit - usage.ai_tokens - usage.ai_reserved, 0)
  into v_remaining;

  return v_remaining;
end;
$$;
