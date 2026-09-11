-- Run after profile-context-cloud.sql. Disposable rows only; always roll back.
begin;
create temporary table profile_context_regression (
  id uuid primary key,
  display_name text,
  profile_context_v2 jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
create trigger preserve_profile before update on profile_context_regression
for each row execute function private.preserve_athlete_profile_context();
create trigger touch_profile before update on profile_context_regression
for each row execute function private.touch_row();

do $$
declare
  test_id uuid := gen_random_uuid();
  original jsonb := '{"age":"39","height":"5 ft 6 in","equipmentAccess":{"rack":{"availability":"available"}}}'::jsonb;
  actual jsonb;
  rev bigint;
begin
  insert into profile_context_regression(id,display_name,profile_context_v2)
  values(test_id,'Disposable profile regression',original);

  -- Match the existing sync RPC's record projection, including omission -> NULL.
  update profile_context_regression t
  set display_name=src.display_name, profile_context_v2=src.profile_context_v2
  from jsonb_populate_record(null::profile_context_regression,
    '{"display_name":"Old client rename"}'::jsonb) src
  where t.id=test_id and t.revision=1;
  select profile_context_v2,revision into actual,rev from profile_context_regression where id=test_id;
  assert actual=original, 'Old client omission erased profile context';
  assert rev=2, 'Existing revision trigger must still run';

  update profile_context_regression set profile_context_v2='{"age":"","height":"5 ft 6 in"}' where id=test_id and revision=2;
  select profile_context_v2,revision into actual,rev from profile_context_regression where id=test_id;
  assert actual->>'age'='', 'Explicit field clear was blocked';
  assert rev=3, 'Profile write did not advance revision';

  update profile_context_regression set profile_context_v2='{"age":"stale"}' where id=test_id and revision=2;
  assert not found, 'Stale base revision overwrote current context';

  update profile_context_regression set profile_context_v2='{}' where id=test_id and revision=3;
  select profile_context_v2 into actual from profile_context_regression where id=test_id;
  assert actual='{}'::jsonb, 'Explicit empty object was blocked';
end;
$$;
rollback;
