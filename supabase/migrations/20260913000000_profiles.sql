-- Accounts: one profile per auth user, and a bucket for the pictures on them.
--
-- The browser holds the publishable key, so anything the table allows can be
-- sent straight to the Data API without passing through the app's own checks.
-- The constraints below are therefore the real validation; the server actions
-- only repeat them to give a readable message.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  full_name text check (char_length(full_name) <= 80),
  avatar_url text check (avatar_url ~ '^https://' and char_length(avatar_url) <= 500),
  profession text check (char_length(profession) <= 60),
  affiliation text check (char_length(affiliation) <= 100),
  location text check (char_length(location) <= 80),
  website text check (website ~ '^https?://\S+$' and char_length(website) <= 200),
  bio text check (char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- a profile is private to its owner: there is no public profile page yet
create policy "Owners read their profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "Owners update their profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- rows are made by the trigger and removed by the cascade, never by a client;
-- and of a row, only the fields the profile page edits can be written
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (username, full_name, avatar_url, profession, affiliation, location, website, bio)
  on table public.profiles to authenticated;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A failure here fails the sign-up itself, so the trigger only copies what the
-- provider handed over and drops anything the constraints would refuse.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  picture text := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), ''), 80),
    case when picture ~ '^https://' and char_length(picture) <= 500 then picture end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- Pictures live at avatars/<user id>/<file>. Anyone may fetch one by its URL;
-- only the owner may list, add or remove what is in their folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/png', 'image/jpeg']);

create policy "Owners list their avatars" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners upload avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owners delete their avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
