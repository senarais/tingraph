-- Let plan RPCs run with the caller's privileges. The private schema is not
-- exposed by the Data API, and these policies still constrain every row if it
-- is ever added to the exposed schema list.

grant usage on schema private to authenticated;
grant select, insert, update on table private.daily_usage to authenticated;
grant select, insert, update on table private.ai_token_reservations to authenticated;

create policy "Owners read their daily usage" on private.daily_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners create their daily usage" on private.daily_usage
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners update their daily usage" on private.daily_usage
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners read their AI reservations" on private.ai_token_reservations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners create their AI reservations" on private.ai_token_reservations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners update their AI reservations" on private.ai_token_reservations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter function public.get_my_entitlements() security invoker;
alter function public.consume_generation() security invoker;
alter function public.reserve_ai_tokens(integer) security invoker;
alter function public.settle_ai_tokens(uuid, integer) security invoker;
