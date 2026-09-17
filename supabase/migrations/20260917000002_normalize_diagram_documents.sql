-- A tab opened before `files` was made explicit may still save Excalidraw's
-- native no-image shape, which omits that key. Normalize before constraints so
-- stale tabs and current clients produce the same stored document.
create function public.normalize_diagram_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(new.document -> 'scene') = 'object'
    and new.document #> '{scene,files}' is null then
    new.document := jsonb_set(new.document, '{scene,files}', '{}'::jsonb, true);
  end if;
  return new;
end;
$$;

revoke execute on function public.normalize_diagram_document()
  from public, anon, authenticated;

create trigger diagrams_normalize_document
  before insert or update on public.diagrams
  for each row execute function public.normalize_diagram_document();
