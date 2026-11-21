-- A saved diagram can be shared by link, view-only or editable, like a document.
--
-- One link per diagram. The token is the capability: 32 random bytes,
-- base64url without padding (43 characters). It is kept as written, not
-- hashed, because the owner has to be able to copy the same link again.
-- Deleting the diagram deletes its link.
create table app.diagram_shares (
  diagram_id uuid primary key references app.diagrams (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  access text not null check (access in ('view', 'edit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger diagram_shares_touch_updated_at
before update on app.diagram_shares
for each row execute function app.touch_updated_at();

grant select, insert, update, delete on app.diagram_shares to tingraph_app;

-- Every save of a diagram moves its revision on by one. A save that names the
-- revision it was made from is refused once someone else has saved since, so
-- two people with the same link never silently overwrite each other.
alter table app.diagrams add column revision bigint not null default 1 check (revision >= 1);
