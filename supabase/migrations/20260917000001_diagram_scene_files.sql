-- Excalidraw leaves `files` out of its JSON when the scene has no images.
-- Keep the stored shape explicit so every document restores the same way.
update public.diagrams
set document = jsonb_set(document, '{scene,files}', '{}'::jsonb, true)
where jsonb_typeof(document -> 'scene') = 'object'
  and document #> '{scene,files}' is null;

alter table public.diagrams drop constraint diagrams_check;

alter table public.diagrams add constraint diagrams_check check (
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
);
