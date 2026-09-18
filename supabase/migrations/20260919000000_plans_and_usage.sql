-- Account plans and server-enforced limits. Payment is intentionally outside
-- this migration: changing profiles.tier to 'premium' activates premium limits.

alter table public.profiles
  add column tier text not null default 'free'
  check (tier in ('free', 'premium'));

-- Existing column grants stay unchanged, so authenticated users can read their
-- tier but cannot promote themselves through the Data API.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  generations integer not null default 0 check (generations >= 0),
  ai_tokens bigint not null default 0 check (ai_tokens >= 0),
  ai_reserved bigint not null default 0 check (ai_reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table private.ai_token_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  reserved_tokens integer not null check (reserved_tokens > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  settled_at timestamptz
);

create index ai_token_reservations_active_idx
  on private.ai_token_reservations (user_id, usage_date, expires_at)
  where settled_at is null;

alter table private.daily_usage enable row level security;
alter table private.ai_token_reservations enable row level security;

/** Current plan and usage, always for the authenticated caller. */
create function public.get_my_entitlements()
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
security definer
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
    case when p.tier = 'premium' then 100000::bigint else 3000::bigint end
  from public.profiles p
  left join private.daily_usage u
    on u.user_id = p.id and u.usage_date = v_date
  where p.id = v_user;
end;
$$;

revoke all on function public.get_my_entitlements() from public, anon, authenticated;
grant execute on function public.get_my_entitlements() to authenticated;

/** Take one generation from today's allowance without a read-then-write race. */
create function public.consume_generation()
returns table (allowed boolean, used integer, usage_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_date date := (now() at time zone 'utc')::date;
  v_tier text;
  v_limit integer;
  v_used integer;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select p.tier into v_tier
  from public.profiles p
  where p.id = v_user;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  v_limit := case when v_tier = 'premium' then null else 10 end;

  insert into private.daily_usage as usage (
    user_id,
    usage_date,
    generations
  ) values (
    v_user,
    v_date,
    1
  )
  on conflict (user_id, usage_date) do update
    set generations = usage.generations + 1,
        updated_at = now()
    where v_limit is null or usage.generations < v_limit
  returning generations into v_used;

  if not found then
    select usage.generations into v_used
    from private.daily_usage usage
    where usage.user_id = v_user and usage.usage_date = v_date;
    return query select false, v_used, v_limit;
    return;
  end if;

  return query select true, v_used, v_limit;
end;
$$;

revoke all on function public.consume_generation() from public, anon, authenticated;
grant execute on function public.consume_generation() to authenticated;

/**
 * Reserve input plus maximum output before calling the AI provider. Expired
 * reservations are released on the caller's next request.
 */
create function public.reserve_ai_tokens(p_tokens integer)
returns table (reservation_id uuid, allowed boolean, remaining bigint)
language plpgsql
security definer
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

  v_limit := case when v_tier = 'premium' then 100000::bigint else 3000::bigint end;

  -- This no-op conflict update locks today's counter before any reservation is
  -- inserted, settled, or expired. Every writer takes locks in this order.
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

revoke all on function public.reserve_ai_tokens(integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_tokens(integer) to authenticated;

/** Replace one private reservation with the provider's actual token count. */
create function public.settle_ai_tokens(p_reservation_id uuid, p_tokens integer)
returns bigint
language plpgsql
security definer
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
  v_limit := case when v_tier = 'premium' then 100000::bigint else 3000::bigint end;

  -- Lock today's usage first, matching reserve_ai_tokens.
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
      ai_tokens = usage.ai_tokens + p_tokens,
      updated_at = now()
  where usage.user_id = v_user and usage.usage_date = v_date
  returning greatest(v_limit - usage.ai_tokens - usage.ai_reserved, 0)
  into v_remaining;

  return v_remaining;
end;
$$;

revoke all on function public.settle_ai_tokens(uuid, integer) from public, anon, authenticated;
grant execute on function public.settle_ai_tokens(uuid, integer) to authenticated;

/** Serialize inserts per user and enforce the saved-diagram ceiling in Postgres. */
create function public.enforce_diagram_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text;
  v_limit integer;
  v_count integer;
begin
  select p.tier into v_tier
  from public.profiles p
  where p.id = new.user_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'profile_not_found';
  end if;

  v_limit := case when v_tier = 'premium' then 100 else 2 end;
  select count(*) into v_count
  from public.diagrams d
  where d.user_id = new.user_id;

  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = 'diagram_limit_reached';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_diagram_limit() from public, anon, authenticated;

create trigger diagrams_enforce_limit
  before insert on public.diagrams
  for each row execute function public.enforce_diagram_limit();
