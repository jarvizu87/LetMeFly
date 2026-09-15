# LetMeFly Deep Audit Continuation — 2026-09-14

Status: in progress

This checkpoint resumes the release-readiness deep dive that was underway before Train Hero Art Pack V1 was created.

Current focus:

1. Wire the locked nine-image Train hero pack into the Train header.
2. Remove the hard-coded single squat/lifter hero behavior.
3. Select hero artwork deterministically from governed workout/day emphasis without changing programming.
4. Verify Day 4 and all future-day read-only cards on desktop and mobile.
5. Continue full-app source/build/runtime audit across Home, Train, Program, Progress, Exercises, Coach, Profile, More/Settings, auth/cloud sync, PWA/lifecycle, persistence, Bar Loader, Exercise Intelligence, substitutions, and program prescription invariants.
6. Sweep for stale legacy UI runtime/build/test references and separate harmless retirement guards from code capable of reintroducing retired layouts.
7. Keep production locked until the audit/fix branch passes the required exact-head gates.

Non-goals:

- No governed program edits.
- No athlete-private data edits.
- No workout-history edits.
- No Training Max changes.
- No production deploy without explicit release authorization.
