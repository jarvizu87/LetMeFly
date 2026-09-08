# Apply Runtime v6

Base candidate: LetMeFly V5.4 Progression Shadow Runtime v5.

Reconstruct the delta patch by concatenating the files in `patch/` in lexical order, base64-decoding, then gunzipping.

Runtime v6 only extends the isolated Shadow-pilot evidence lane. It does not alter canonical workout/program data and does not enable visible XP/Quest UI.

After applying, rerun the full V5.4 source/Crownforge/Exercise Intelligence audits plus `node scripts/audit-progression-shadow-v54.mjs`.

Do not merge into the active UI/runtime lane until real Shadow pilot evidence passes the gate.
