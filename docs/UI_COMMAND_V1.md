# LetMeFly Command UI — V1

This branch applies the selected cinematic Command visual system to the audited V5.2 application source without changing program prescriptions, private-data storage, sync rules, or workout write semantics.

## Design system

- Near-black / graphite app shell with crimson primary actions and restrained purple secondary accents.
- Cinematic Crownforge / Black Crown presentation using crown, mountain, steel, and atmospheric layers.
- Large display hierarchy with high-readability workout text.
- Mobile-first five-item navigation: Home, Train, Program, Progress, More. Desktop exposes Exercises, Coach, and Profile directly.
- Home becomes an athlete command center with program context, training focus, readiness, current performance, and milestone cards.
- Train keeps horizontally swiped workout sections, with readiness first and session review last.
- Program presents Crownforge as the active bridge and Black Crown as a four-phase long-term roadmap.
- Progress emphasizes training-max trends, session history, and meaningful performance summaries.
- Exercises, Coach, Profile, and More use the same visual language instead of generic utility-page styling.

## Boundaries preserved

- No athlete identity, bodyweight, training max, history, readiness, credential, or token is hard-coded into public source.
- No Crownforge or Black Crown prescription is changed by this UI pass.
- IndexedDB remains the active private workout database.
- Supabase remains optional and cannot gate local workout access.
- Workout set logging, backup/restore, migration, and sync behavior remain owned by their existing services.

## Validation

- Source/security audit: PASS
- Crownforge Week 1 audit: PASS
- Crownforge Week 2 audit: PASS
- Full TypeScript typecheck with temporary Supabase audit declaration: PASS
- Real networked npm/Vite build and browser QA: pending
