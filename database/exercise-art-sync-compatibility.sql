-- Private artwork has its own authenticated lookup and download lifecycle.
-- It is not an IndexedDB domain entity and must not enter the domain-sync feed.
-- Keep the existing ownership policy and retain every audit/change row.
DO $preflight$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.sync_changes'::regclass) THEN
    RAISE EXCEPTION 'sync_changes must already enforce RLS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sync_changes'
      AND policyname = 'sync_changes_select_own'
      AND permissive = 'PERMISSIVE' AND cmd = 'SELECT'
      AND 'authenticated' = ANY (roles)
      AND qual LIKE '%private.user_owns_athlete%'
  ) THEN
    RAISE EXCEPTION 'Expected authenticated athlete-ownership policy is absent';
  END IF;
END;
$preflight$;

CREATE POLICY sync_changes_domain_feed_only
ON public.sync_changes
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (entity_type <> 'exercise_thumbnail_overrides');

COMMENT ON POLICY sync_changes_domain_feed_only ON public.sync_changes IS
  'Domain sync excludes separately delivered private artwork metadata. Existing athlete ownership remains required; stored audit rows are retained.';
