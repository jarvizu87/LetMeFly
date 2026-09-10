# Issue #54 — Use This Substitute for Today

## Contract

A governed substitution may change only the active workout instance. Crownforge, Crown Maintenance, and Black Crown remain authoritative and are never rewritten by the substitution workflow.

## Required behavior

- Resolve the programmed movement through Exercise Intelligence name/alias mapping when program IDs differ from intelligence IDs.
- Offer only current-app governed alternatives that are not `DO NOT DEFAULT` and preserve the programmed role.
- Preserve the original programmed exercise in workout provenance.
- Preserve programmed sets, reps/metrics, rest, grouping, round order, and future program progression.
- Autofill load only when the governed rule provides a deterministic conversion; otherwise require/allow an explicit editable starting load rather than blindly copying pounds.
- Persist the substitute through reload/resume.
- Prevent relabeling completed sets under a different exercise identity.
- Allow exact undo after substitute sets are reopened/unlogged.
- Default future occurrences back to the original programmed movement.

## Real browser fixture

Crownforge W1D7 `Optional Easy Walk` resolves to governed `Walking`, with `Stationary Bike` as a `PROMOTE CORE`, role-preserving substitute.

The browser regression exercises:

1. create a disposable athlete;
2. make Crownforge W1D7 current;
3. start Workout Mode;
4. open governed substitution guidance;
5. apply `Stationary Bike` for today;
6. verify prescribed-vs-performed UI and unchanged set structure;
7. reload and resume the same substitute;
8. log a substitute set;
9. verify undo is blocked while that set is completed;
10. reopen the set;
11. undo the substitute;
12. reload again and verify the original `Optional Easy Walk` identity remains.

## Soak integration

After this feature is green on its own branch, the full lifecycle injury/substitution athlete should be updated to call the real mutation/persistence path rather than only simulating substitutions in memory.
