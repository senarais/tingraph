-- Run after migrations on a local database; transaction leaves no test data.
begin;
do $$
declare
  u uuid;
  legacy uuid;
  manual uuid;
  expiry timestamptz;
begin
  insert into auth.users (email) values ('zone-check-' || gen_random_uuid()::text || '@example.test') returning id into u;
  insert into ops.payment_orders(user_id, provider, currency, amount, method, status, paid_at, time_zone)
    values (u, 'paypal', 'USD', 500, 'paypal', 'paid', '2026-03-01 14:00:00+00', 'America/New_York');
  select ops.refresh_premium(u) into expiry;
  if expiry is distinct from '2026-04-01 04:00:00+00'::timestamptz then
    raise exception 'first purchase did not expire at New York midnight: %', expiry;
  end if;
  insert into ops.payment_orders(user_id, provider, currency, amount, method, status, paid_at, time_zone)
    values (u, 'paypal', 'USD', 500, 'paypal', 'paid', '2026-03-10 14:00:00+00', 'America/New_York');
  select ops.refresh_premium(u) into expiry;
  if expiry is distinct from '2026-05-01 04:00:00+00'::timestamptz then
    raise exception 'renewal did not add 30 whole local days: %', expiry;
  end if;
  update ops.payment_orders set status = 'refunded' where user_id = u;
  select ops.refresh_premium(u) into expiry;
  if expiry is not null or (select tier from app.profiles where id = u) <> 'free' then
    raise exception 'fully refunded payments still grant premium';
  end if;

  insert into auth.users (email) values ('zone-check-' || gen_random_uuid()::text || '@example.test') returning id into legacy;
  update app.profiles set time_zone = 'Asia/Jakarta' where id = legacy;
  insert into ops.payment_orders(user_id, provider, currency, amount, method, status, paid_at)
    values (legacy, 'paypal', 'USD', 500, 'paypal', 'paid', '2026-09-24 02:00:00+00');
  select ops.refresh_premium(legacy) into expiry;
  if expiry is distinct from '2026-10-24 17:00:00+00'::timestamptz then
    raise exception 'older purchase did not use owner timezone: %', expiry;
  end if;

  insert into auth.users (email) values ('zone-check-' || gen_random_uuid()::text || '@example.test') returning id into manual;
  update app.profiles set tier = 'premium', premium_until = '2099-09-24 05:00:00+00', time_zone = 'Asia/Jakarta' where id = manual;
  select ops.refresh_premium(manual) into expiry;
  if expiry is distinct from '2099-09-24 17:00:00+00'::timestamptz then
    raise exception 'manual plan did not end at local midnight: %', expiry;
  end if;
  if ops.end_of_local_day('2099-09-24 17:00:00+00', 'Asia/Jakarta') is distinct from expiry then
    raise exception 'already aligned manual expiry moved to another day';
  end if;
end;
$$;
rollback;
