-- Run after migrations against a local database. All test data is rolled back.
begin;
do $$
declare
  u uuid;
  one uuid;
  two uuid;
  three uuid;
  four uuid;
  ok boolean;
  count_used integer;
  res uuid;
begin
  insert into auth.users (email) values ('checkout-self-check-' || gen_random_uuid()::text || '@example.test') returning id into u;
  for i in 1..10 loop
    select allowed into ok from app.consume_generation(u);
    if not ok then raise exception 'generation rejected before limit'; end if;
  end loop;
  select allowed into ok from app.consume_generation(u);
  if ok then raise exception 'generation limit bypassed'; end if;
  update app.usage_windows set started_at = now() - interval '25 hours' where user_id = u and kind = 'generation';
  select allowed, used into ok, count_used from app.consume_generation(u);
  if not ok or count_used <> 1 then raise exception 'generation window did not restart'; end if;

  select reservation_id, allowed into res, ok from app.reserve_ai_tokens(u, 1990);
  if not ok or res is null then raise exception 'AI reservation failed'; end if;
  select allowed into ok from app.reserve_ai_tokens(u, 20);
  if ok then raise exception 'AI reservation exceeded allowance'; end if;
  perform app.settle_ai_tokens(u, res, 100);
  select allowed into ok from app.reserve_ai_tokens(u, 1800);
  if not ok then raise exception 'unused AI reservation was not released'; end if;

  insert into ops.discount_codes (code, percent, max_uses) values ('CHECKOUT99', 20, 1);
  insert into ops.payment_orders (user_id, provider, currency, amount, method, base_cents)
    values (u, 'paypal', 'USD', 450, 'paypal', 400) returning id into one;
  insert into ops.payment_orders (user_id, provider, currency, amount, method, base_cents)
    values (u, 'paypal', 'USD', 450, 'paypal', 400) returning id into two;
  select ops.reserve_discount(one, 'CHECKOUT99') into ok;
  if not ok then raise exception 'first discount reservation rejected'; end if;
  select ops.reserve_discount(two, 'CHECKOUT99') into ok;
  if ok then raise exception 'discount overbooked'; end if;
  update ops.payment_orders set expires_at = now() - interval '1 second' where id = one;
  perform ops.expire_payments();
  select ops.reserve_discount(two, 'CHECKOUT99') into ok;
  if not ok then raise exception 'expired reservation still holds code'; end if;
  update ops.payment_orders set provider_id = 'provider-test', expires_at = now() - interval '1 second' where id = two;
  perform ops.expire_payments();
  if (select status from ops.payment_orders where id = two) <> 'pending' then
    raise exception 'provider-owned order released without verification';
  end if;
  perform ops.expire_confirmed_payment(two, 'provider-test');
  if (select status from ops.payment_orders where id = two) <> 'expired' then
    raise exception 'verified expiry did not release order';
  end if;
  insert into ops.payment_orders (user_id, provider, currency, amount, method, base_cents)
    values (u, 'paypal', 'USD', 450, 'paypal', 400) returning id into three;
  select ops.reserve_discount(three, 'CHECKOUT99') into ok;
  if not ok then raise exception 'verified expired slot remained locked'; end if;
  update ops.payment_orders set provider_id = 'paid-provider' where id = three;
  perform ops.settle_payment(three, 'paypal', 'paid-provider', 'paid-capture', 'USD', 450, false);
  update ops.payment_orders set expires_at = now() - interval '1 second' where id = three;
  perform ops.expire_payments();
  insert into ops.payment_orders (user_id, provider, currency, amount, method, base_cents)
    values (u, 'paypal', 'USD', 450, 'paypal', 400) returning id into four;
  select ops.reserve_discount(four, 'CHECKOUT99') into ok;
  if ok then raise exception 'paid discount was released by expiry'; end if;

  insert into ops.discount_codes(code, percent, max_uses) values ('TOGGLE99', 20, 1);
  update ops.discount_codes set enabled = false where code = 'TOGGLE99';
  select ops.reserve_discount(four, 'TOGGLE99') into ok;
  if ok then raise exception 'inactive code was redeemed'; end if;
  update ops.discount_codes set enabled = true where code = 'TOGGLE99';
  select ops.reserve_discount(four, 'TOGGLE99') into ok;
  if not ok then raise exception 'reactivated code was rejected'; end if;
  update ops.discount_codes set enabled = false, deleted_at = now() where code = 'TOGGLE99';
  select ops.reserve_discount(one, 'TOGGLE99') into ok;
  if ok then raise exception 'archived code was redeemed'; end if;
  if (select discount_code from ops.payment_orders where id = four) <> 'TOGGLE99' then
    raise exception 'code archive removed order history';
  end if;
end;
$$;
rollback;
