-- Private thumbnail delivery. Apply through Supabase migration tooling.
-- Image bytes are uploaded through Storage API; never create storage.objects rows here.
-- Existing Cloudinary provenance remains nullable for assets born in private storage.
alter table public.exercise_thumbnail_overrides alter column cloudinary_public_id drop not null;

create policy athlete_exercise_art_select_own on storage.objects
for select to authenticated using (
  bucket_id = 'athlete-exercise-art'
  and exists (
    select 1 from public.athletes a
    where a.id::text = (storage.foldername(storage.objects.name))[1]
      and a.owner_user_id = (select auth.uid())
      and a.deleted_at is null
  )
);

-- Browser runtime reads approved maps only. Upload/review mutations stay privileged;
-- authenticated users receive no INSERT/UPDATE/DELETE grant from this migration.
