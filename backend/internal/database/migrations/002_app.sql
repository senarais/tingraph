create schema app;
revoke all on schema app from public;

create function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table app.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium')),
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  full_name text check (char_length(full_name) <= 80),
  avatar_path text check (avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.(webp|png|jpg)$'),
  profession text check (char_length(profession) <= 60),
  affiliation text check (char_length(affiliation) <= 100),
  location text check (char_length(location) <= 80),
  website text check (website ~ '^https?://\S+$' and char_length(website) <= 200),
  bio text check (char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch_updated_at
before update on app.profiles
for each row execute function app.touch_updated_at();

create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function app.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_user();

create table app.diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (
    title = btrim(title)
    and char_length(title) between 1 and 120
  ),
  category text not null check (category = any (array[
    'flow', 'bpmn', 'org', 'usecase', 'activity', 'sequence', 'erd',
    'bar', 'line', 'pie', 'scatter', 'mind', 'matrix', 'venn', 'fishbone'
  ])),
  document jsonb not null check (
    jsonb_typeof(document) = 'object'
    and document ?& array['version', 'category', 'source', 'direction', 'ink', 'style', 'scene']
    and document ->> 'version' = '1'
    and document ->> 'category' = category
    and jsonb_typeof(document -> 'source') = 'string'
    and char_length(document ->> 'source') <= 200000
    and document ->> 'direction' in ('down', 'right')
    and jsonb_typeof(document -> 'ink') = 'object'
    and document ->> 'style' in ('formal', 'playful')
    and jsonb_typeof(document -> 'scene') = 'object'
    and (document -> 'scene') ?& array['elements', 'files']
    and jsonb_typeof(document #> '{scene,elements}') = 'array'
    and jsonb_typeof(document #> '{scene,files}') = 'object'
    and octet_length(document::text) <= 10485760
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index diagrams_owner_updated_idx on app.diagrams (user_id, updated_at desc);

create trigger diagrams_touch_updated_at
before update on app.diagrams
for each row execute function app.touch_updated_at();

create table app.daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  generations integer not null default 0 check (generations >= 0),
  ai_tokens bigint not null default 0 check (ai_tokens >= 0),
  ai_reserved bigint not null default 0 check (ai_reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table app.ai_token_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  reserved_tokens integer not null check (reserved_tokens > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  settled_at timestamptz
);

create index ai_token_reservations_active_idx
  on app.ai_token_reservations (user_id, usage_date, expires_at)
  where settled_at is null;

create function app.enforce_diagram_limit()
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
  select p.tier into v_tier from app.profiles p where p.id = new.user_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'profile_not_found';
  end if;
  v_limit := case when v_tier = 'premium' then 100 else 2 end;
  select count(*) into v_count from app.diagrams d where d.user_id = new.user_id;
  if v_count >= v_limit then
    raise exception using errcode = 'P0001', message = 'diagram_limit_reached';
  end if;
  return new;
end;
$$;

revoke execute on function app.enforce_diagram_limit() from public;

create trigger diagrams_enforce_limit
before insert on app.diagrams
for each row execute function app.enforce_diagram_limit();

create function app.consume_generation(p_user uuid)
returns table (allowed boolean, used integer, usage_limit integer)
language plpgsql
set search_path = ''
as $$
declare
  v_date date := (now() at time zone 'utc')::date;
  v_tier text;
  v_limit integer;
  v_used integer;
begin
  select p.tier into v_tier from app.profiles p where p.id = p_user;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  v_limit := case when v_tier = 'premium' then null else 10 end;
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

create function app.reserve_ai_tokens(p_user uuid, p_tokens integer)
returns table (reservation_id uuid, allowed boolean, remaining bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_date date := (now() at time zone 'utc')::date;
  v_tier text;
  v_limit bigint;
  v_used bigint;
  v_reserved bigint;
  v_released bigint;
  v_id uuid;
begin
  if p_tokens is null or p_tokens <= 0 then
    raise exception using errcode = '22023', message = 'invalid_token_reservation';
  end if;
  select p.tier into v_tier from app.profiles p where p.id = p_user;
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  v_limit := case when v_tier = 'premium' then 100000::bigint else 2000::bigint end;
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

create function app.settle_ai_tokens(p_user uuid, p_reservation_id uuid, p_tokens integer)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_date date;
  v_owner uuid;
  v_tier text;
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
  select p.tier into v_tier from app.profiles p where p.id = p_user;
  v_limit := case when v_tier = 'premium' then 100000::bigint else 2000::bigint end;
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
