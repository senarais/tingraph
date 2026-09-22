revoke update on auth.users from tingraph_app;
grant update (email_verified_at) on auth.users to tingraph_app;

revoke update on auth.oauth_accounts from tingraph_app;

revoke update on app.profiles from tingraph_app;
grant update (
  username, full_name, avatar_path, profession, affiliation, location, website, bio
) on app.profiles to tingraph_app;

revoke insert, update on app.daily_usage from tingraph_app;
revoke select, insert, update on app.ai_token_reservations from tingraph_app;

alter function app.consume_generation(uuid) security definer;
alter function app.reserve_ai_tokens(uuid, integer) security definer;
alter function app.settle_ai_tokens(uuid, uuid, integer) security definer;

revoke all on function app.consume_generation(uuid) from public;
revoke all on function app.reserve_ai_tokens(uuid, integer) from public;
revoke all on function app.settle_ai_tokens(uuid, uuid, integer) from public;

grant execute on function app.consume_generation(uuid) to tingraph_app;
grant execute on function app.reserve_ai_tokens(uuid, integer) to tingraph_app;
grant execute on function app.settle_ai_tokens(uuid, uuid, integer) to tingraph_app;

grant delete on ops.email_outbox to tingraph_app;
