# Crownstorm UI Integration Handoff

This overlay is intentionally stacked on the progression Shadow runtime lane.

## When the Shadow pilot passes

1. Keep the Command V2 Home dashboard unchanged.
2. Add one `Crownstorm Path` row to the existing More command menu.
3. The row must be created through `moreMenuCrownstormEntry()` so LIVE mode remains fail-closed.
4. Mount `CrownstormController` into a dedicated full-screen app surface.
5. Exit returns to More.
6. Connect the real progression snapshot/quest/achievement/journey adapters.
7. Use the normal Cloudinary resolver with the public IDs in `CROWNSTORM_ART_PUBLIC_IDS`.
8. Persist cosmetics/caches/preferences in private IndexedDB. Do not add private localStorage writes.
9. Keep all base app nav and Home rendering unchanged.
10. Run the existing Command UI, source, program, Exercise Intelligence, TypeScript, and production audits.

## Separate runtime gates

The UI being technically complete does **not** authorize visibility. LIVE entry remains locked behind the runtime-v10 Shadow pilot authorization.
