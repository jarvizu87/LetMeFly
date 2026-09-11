-- Add durable profile context to the existing owned athlete row. Existing RLS,
-- revision checks and sync-change triggers apply without new grants or RPCs.
alter table public.athletes
  add column if not exists profile_context_v2 jsonb;

alter table public.athletes
  add constraint athletes_profile_context_v2_object
  check (profile_context_v2 is null or (
    jsonb_typeof(profile_context_v2) = 'object'
    and octet_length(profile_context_v2::text) <= 65536
  ));

-- Old app versions omit this column from their full-row sync payload. The
-- existing RPC's jsonb_populate_record turns that omission into SQL NULL.
-- Preserve the newer context; field clears use explicit empty strings in an
-- object, and an empty object is also an intentional supported replacement.
create or replace function private.preserve_athlete_profile_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.profile_context_v2 is null and old.profile_context_v2 is not null then
    new.profile_context_v2 := old.profile_context_v2;
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_athlete_profile_context() from public;

create trigger trg_preserve_athlete_profile_context
before update on public.athletes
for each row execute function private.preserve_athlete_profile_context();

comment on column public.athletes.profile_context_v2 is
  'Private athlete profile context. Whole-object NULL means legacy/unset; clear fields using explicit empty strings.';
