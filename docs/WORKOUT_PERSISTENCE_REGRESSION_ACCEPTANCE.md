# Workout Persistence Regression Acceptance Criteria

A fix is not complete until all of the following pass:

- Completing a native set writes that exact set record locally and a subsequent authoritative workout reload returns it as completed.
- Session Review derives its `done / total` count from the same reloaded authoritative set records.
- Multiple completed sets increment Review one-for-one; a reopened set decrements Review one-for-one.
- A completed workout can proceed normally when all required sets are logged; incomplete/optional work remains accurately represented.
- No UI overlay writes directly to IndexedDB, localStorage, Supabase, or a parallel workout ledger.
- Unprescribed load carry-forward survives the native workout refresh: e.g. Incline DB Press Set 1 logged at 40 lb prefills Set 2 with 40 lb.
- Any program-prescribed load remains untouched, whether fixed or percentage/TM based.
- Crownforge, Crown Maintenance, and Black Crown prescriptions are unchanged.
- Existing saved-set Edit / Undo / Restore continues through the native set toggle.
- Full mock training-cycle and real mobile-browser audits pass before merge.
