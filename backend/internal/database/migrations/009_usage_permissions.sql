-- The API can read the aggregate, not individual AI reservations.
create function app.active_ai_reserved(p_user uuid, p_window timestamptz)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(r.reserved_tokens), 0)::bigint
  from app.ai_token_reservations r
  where r.user_id = p_user and r.window_started_at = p_window
    and r.settled_at is null and r.expires_at > now()
$$;
revoke all on function app.active_ai_reserved(uuid, timestamptz) from public;
grant execute on function app.active_ai_reserved(uuid, timestamptz) to tingraph_app;
revoke insert, update on app.usage_windows from tingraph_app;
