-- Private, editable diagrams. The saved document contains Tingraph's source
-- and settings plus Excalidraw's scene, because edits made on the sheet are
-- authoritative after Generate.

create table public.diagrams (
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
    and document ->> 'version' = '1'
    and document ->> 'category' = category
    and jsonb_typeof(document -> 'source') = 'string'
    and char_length(document ->> 'source') <= 200000
    and jsonb_typeof(document -> 'scene') = 'object'
    and jsonb_typeof(document #> '{scene,elements}') = 'array'
    and jsonb_typeof(document #> '{scene,files}') = 'object'
    and octet_length(document::text) <= 10485760
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index diagrams_owner_updated_idx
  on public.diagrams (user_id, updated_at desc);

alter table public.diagrams enable row level security;

create policy "Owners read their diagrams" on public.diagrams
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners create their diagrams" on public.diagrams
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners update their diagrams" on public.diagrams
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners delete their diagrams" on public.diagrams
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.diagrams from anon, authenticated;
grant select on table public.diagrams to authenticated;
grant insert (user_id, title, category, document) on table public.diagrams to authenticated;
grant update (title, category, document) on table public.diagrams to authenticated;
grant delete on table public.diagrams to authenticated;

create trigger diagrams_touch_updated_at
  before update on public.diagrams
  for each row execute function public.touch_updated_at();
