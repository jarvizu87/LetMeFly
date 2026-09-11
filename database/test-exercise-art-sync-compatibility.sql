BEGIN;
DO $verify$
DECLARE
  athlete RECORD;
  expected_domain BIGINT;
  expected_art BIGINT;
  actual_count BIGINT;
  owners_checked INTEGER := 0;
BEGIN
  FOR athlete IN
    SELECT DISTINCT a.id, a.owner_user_id
    FROM public.athletes a
    JOIN public.exercise_thumbnail_overrides t ON t.athlete_id = a.id
    WHERE a.deleted_at IS NULL
  LOOP
    SELECT count(*) INTO expected_domain FROM public.sync_changes
      WHERE athlete_id = athlete.id AND entity_type <> 'exercise_thumbnail_overrides';
    SELECT count(*) INTO expected_art FROM public.exercise_thumbnail_overrides
      WHERE athlete_id = athlete.id;
    PERFORM set_config('request.jwt.claim.sub', athlete.owner_user_id::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', athlete.owner_user_id, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO actual_count FROM public.sync_changes WHERE athlete_id = athlete.id;
    IF actual_count <> expected_domain THEN
      RAISE EXCEPTION 'Owner domain changes differ: expected %, got %', expected_domain, actual_count;
    END IF;
    SELECT count(*) INTO actual_count FROM public.sync_changes
      WHERE athlete_id = athlete.id AND entity_type = 'exercise_thumbnail_overrides';
    IF actual_count <> 0 THEN RAISE EXCEPTION 'Artwork entered domain sync'; END IF;
    SELECT count(*) INTO actual_count FROM public.exercise_thumbnail_overrides WHERE athlete_id = athlete.id;
    IF actual_count <> expected_art THEN RAISE EXCEPTION 'Direct owner artwork lookup changed'; END IF;
    EXECUTE 'RESET ROLE';
    owners_checked := owners_checked + 1;
  END LOOP;
  IF owners_checked = 0 THEN RAISE EXCEPTION 'No existing artwork owner to verify'; END IF;

  -- A nonowner identity must see no private sync or artwork rows.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000000', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO actual_count FROM public.sync_changes;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'Nonowner can read domain changes'; END IF;
  SELECT count(*) INTO actual_count FROM public.exercise_thumbnail_overrides;
  IF actual_count <> 0 THEN RAISE EXCEPTION 'Nonowner can read private artwork'; END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    SELECT count(*) INTO actual_count FROM public.sync_changes;
    IF actual_count <> 0 THEN RAISE EXCEPTION 'Anonymous can read sync changes'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO actual_count FROM public.exercise_thumbnail_overrides;
    IF actual_count <> 0 THEN RAISE EXCEPTION 'Anonymous can read private artwork'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
END;
$verify$;
SELECT jsonb_build_object(
  'owner_domain_and_artwork', 'PASS',
  'nonowner_and_anonymous_denial', 'PASS',
  'retained_sync_rows', (SELECT count(*) FROM public.sync_changes),
  'retained_artwork_events', (SELECT count(*) FROM public.sync_changes WHERE entity_type='exercise_thumbnail_overrides'),
  'approved_mappings', (SELECT count(*) FROM public.exercise_thumbnail_overrides WHERE status='approved' AND is_active AND deleted_at IS NULL)
) AS verification;
ROLLBACK;
