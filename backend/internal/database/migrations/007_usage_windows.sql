-- Each allowance starts on first use, independently of the other allowance.
create table app.usage_windows (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('generation', 'ai')),
  started_at timestamptz not null,
  used bigint not null default 0 check (used >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  primary key (user_id, kind)
);
grant select, insert, update on app.usage_windows to tingraph_app;
alter table app.ai_token_reservations add column window_started_at timestamptz;

create or replace function app.consume_generation(p_user uuid)
returns table (allowed boolean, used integer, usage_limit integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_premium boolean;
  v_used bigint;
begin
  select p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())
    into v_premium from app.profiles p where p.id = p_user;
  if not found then raise exception 'profile_not_found'; end if;
  usage_limit := case when v_premium then null else 10 end;
  insert into app.usage_windows as w (user_id, kind, started_at, used)
    values (p_user, 'generation', now(), 0)
    on conflict (user_id, kind) do nothing;
  select w.used into v_used from app.usage_windows w
    where w.user_id = p_user and w.kind = 'generation' for update;
  if (select w.started_at from app.usage_windows w where w.user_id = p_user and w.kind = 'generation') <= now() - interval '24 hours' then
    update app.usage_windows w set started_at = now(), used = 0
      where w.user_id = p_user and w.kind = 'generation';
    v_used := 0;
  end if;
  allowed := usage_limit is null or v_used < usage_limit;
  if allowed then
    update app.usage_windows w set used = w.used + 1
      where w.user_id = p_user and w.kind = 'generation';
    insert into app.daily_usage as d (user_id, usage_date, generations)
      values (p_user, (now() at time zone 'utc')::date, 1)
      on conflict (user_id, usage_date) do update set generations = d.generations + 1;
    v_used := v_used + 1;
  end if;
  used := v_used::integer;
  return next;
end;
$$;

create or replace function app.reserve_ai_tokens(p_user uuid, p_tokens integer)
returns table (reservation_id uuid, allowed boolean, remaining bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_premium boolean;
  v_limit bigint;
  v_window app.usage_windows%rowtype;
  v_released bigint;
begin
  if p_tokens is null or p_tokens <= 0 then raise exception 'invalid_token_reservation'; end if;
  select p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())
    into v_premium from app.profiles p where p.id = p_user;
  if not found then raise exception 'profile_not_found'; end if;
  v_limit := case when v_premium then 100000 else 2000 end;
  insert into app.usage_windows (user_id, kind, started_at)
    values (p_user, 'ai', now()) on conflict (user_id, kind) do nothing;
  select * into v_window from app.usage_windows w
    where w.user_id = p_user and w.kind = 'ai' for update;
  if v_window.started_at <= now() - interval '24 hours' then
    update app.usage_windows w set started_at = now(), used = 0, reserved = 0
      where w.user_id = p_user and w.kind = 'ai' returning * into v_window;
  end if;
  with expired as (
    update app.ai_token_reservations r set settled_at = now()
      where r.user_id = p_user and r.window_started_at = v_window.started_at
        and r.settled_at is null and r.expires_at <= now()
      returning r.reserved_tokens
  ) select coalesce(sum(e.reserved_tokens), 0) into v_released from expired e;
  if v_released > 0 then
    update app.usage_windows w set reserved = greatest(0, reserved - v_released)
      where w.user_id = p_user and w.kind = 'ai' returning * into v_window;
  end if;
  allowed := v_window.used + v_window.reserved + p_tokens <= v_limit;
  remaining := greatest(v_limit - v_window.used - v_window.reserved - case when allowed then p_tokens else 0 end, 0);
  if allowed then
    insert into app.ai_token_reservations (user_id, usage_date, window_started_at, reserved_tokens)
      values (p_user, (now() at time zone 'utc')::date, v_window.started_at, p_tokens)
      returning id into reservation_id;
    update app.usage_windows w set reserved = reserved + p_tokens
      where w.user_id = p_user and w.kind = 'ai';
  end if;
  return next;
end;
$$;

create or replace function app.settle_ai_tokens(p_user uuid, p_reservation_id uuid, p_tokens integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_res app.ai_token_reservations%rowtype;
  v_window app.usage_windows%rowtype;
  v_premium boolean;
  v_limit bigint;
begin
  if p_reservation_id is null or p_tokens is null or p_tokens < 0 then raise exception 'invalid_token_settlement'; end if;
  select * into v_res from app.ai_token_reservations r where r.id = p_reservation_id;
  if not found or v_res.user_id <> p_user then raise exception 'invalid_token_reservation'; end if;
  select p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())
    into v_premium from app.profiles p where p.id = p_user;
  v_limit := case when v_premium then 100000 else 2000 end;
  select * into v_window from app.usage_windows w where w.user_id = p_user and w.kind = 'ai' for update;
  update app.ai_token_reservations r set settled_at = now()
    where r.id = p_reservation_id and r.settled_at is null returning * into v_res;
  if found and v_res.window_started_at = v_window.started_at then
    update app.usage_windows w set reserved = greatest(0, reserved - v_res.reserved_tokens),
      used = used + least(p_tokens, v_res.reserved_tokens)
      where w.user_id = p_user and w.kind = 'ai' returning * into v_window;
  end if;
  if found then
    insert into app.daily_usage as d (user_id, usage_date, ai_tokens)
      values (p_user, (now() at time zone 'utc')::date, least(p_tokens, v_res.reserved_tokens))
      on conflict (user_id, usage_date) do update set ai_tokens = d.ai_tokens + excluded.ai_tokens;
  end if;
  return greatest(v_limit - v_window.used - v_window.reserved, 0);
end;
$$;
