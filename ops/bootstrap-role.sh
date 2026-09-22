#!/bin/sh
set -eu

database_url=$(cat /run/secrets/migrations_database_url)
app_password=$(cat /run/secrets/postgres_app_password)
backup_password=$(cat /run/secrets/postgres_backup_password)

psql "$database_url" --set=ON_ERROR_STOP=1 --set=app_password="$app_password" --set=backup_password="$backup_password" <<'SQL'
select case
  when exists (select from pg_roles where rolname = 'tingraph_app')
    then format('alter role tingraph_app login password %L', :'app_password')
  else format('create role tingraph_app login password %L', :'app_password')
end \gexec

alter role tingraph_app nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
alter role tingraph_app set search_path = pg_catalog;
revoke all on database tingraph from public;
grant connect on database tingraph to tingraph_app;

select case
  when exists (select from pg_roles where rolname = 'tingraph_backup')
    then format('alter role tingraph_backup login password %L', :'backup_password')
  else format('create role tingraph_backup login password %L', :'backup_password')
end \gexec

alter role tingraph_backup nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls;
alter role tingraph_backup set search_path = pg_catalog;
grant pg_read_all_data to tingraph_backup;
grant connect on database tingraph to tingraph_backup;
SQL
