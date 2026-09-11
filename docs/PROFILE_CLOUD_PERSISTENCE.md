# Profile cloud persistence

Profile context is stored in the private athlete row and the same atomic outbox
as other profile changes. Earlier cloud schemas omitted `profile_context_v2`;
their generic sync projection silently dropped it. Local extension retention
could preserve the profile on one device but could not deliver it to another.

Apply `database/profile-context-cloud.sql` once as the named Supabase migration
`durable_athlete_profile_context`, before the app release. It adds the nullable
JSONB column to the existing RLS-protected table; no grants or ownership/RPC
rules change. The existing revision and change-feed triggers automatically
include the new column. Run `database/test-profile-context-cloud.sql` afterward;
it exercises disposable temporary rows and rolls back.

An older client omitting the new column produces SQL NULL through the existing
RPC. A narrow trigger preserves existing context in that case. Profile field
clears remain explicit empty strings; `{}` is also an accepted replacement.
The new client similarly preserves local pre-migration context when reading a
null/absent column. Explicit remote objects remain authoritative, subject to
the existing revision and conflict guards.

The cloud-sync workflow verifies native profile save, outbox acknowledgement,
fresh-device pull, null-column compatibility, clear/stale/conflict behavior,
and preservation of program progress and training maxes. Importing a profile
still requires the correct active athlete and a native Profile save. A profile
file does not alter workout history, training maxes, or program advancement.

User-specific profile values and athlete IDs must never enter this repository.
