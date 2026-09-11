# Issue #54 — Use This Substitute for Today

## Contract

A governed substitution may change only the active workout instance. Crownforge, Crown Maintenance, and Black Crown remain authoritative and are never rewritten by the substitution workflow.

## Required behavior

- Resolve the programmed movement through Exercise Intelligence name/alias mapping when program IDs differ from intelligence IDs.
- Offer only current-app governed alternatives that are not `DO NOT DEFAULT` and preserve the programmed role.
- Rank stronger fits and known-available equipment ahead of weaker/unknown options.
- If equipment availability is unknown, ask once in the substitution flow and allow the athlete to save the answer to their private profile or keep it today-only.
- Preserve the original programmed exercise in workout provenance.
- Preserve programmed sets, reps/metrics, RPE/RIR, tempo where applicable, rest, grouping, round order, and future program progression.
- Use machine-readable load strategies (`same-load`, `percentage-adjustment`, `rpe-guided`, `rep-guided`, `no-load-transfer`) rather than parsing coaching prose as arithmetic.
- Never copy pounds for non-comparable resistance models such as machine stack to band resistance.
- Surface the substitute movement's previous completed performance when available.
- Allow an optional substitution reason; discomfort/possible-strain requires the safety boundary acknowledgement before apply.
- Persist the substitute, reason, load strategy, and prescribed/performed provenance through reload/resume.
- Allow exact Undo Substitute only before any substitute performance has been logged.
- Once a substitute set is logged, preserve the performed-exercise identity permanently for that workout even if the set is later reopened for correction.
- Default future occurrences back to the original programmed movement.
- Do not add a permanent/always-substitute action to this feature.

## Real browser fixture

Crownforge W1D7 `Optional Easy Walk` resolves to governed `Walking`, with `Stationary Bike` as a `PROMOTE CORE`, role-preserving substitute.

The browser regression exercises:

1. create a disposable athlete;
2. make Crownforge W1D7 current and start Workout Mode;
3. open governed substitution guidance;
4. verify Stationary Bike initially asks whether its equipment is available;
5. choose **Yes • Save to Profile** and prove the private athlete profile is enriched;
6. apply Stationary Bike for today with reason `Preference`;
7. verify Program Slot vs Performing Today identity and unchanged programmed set structure;
8. reload and prove the active substitute persists;
9. Undo before any substitute performance is logged and prove the original workout identity is restored through reload;
10. reopen the substitution guide and prove the saved equipment answer is reused without asking again;
11. choose `Discomfort / possible strain` and prove Apply is blocked until the safety acknowledgement is checked;
12. apply the governed substitute and verify the reason is persisted;
13. log a substitute set through native Workout Mode persistence;
14. prove the set receives an immutable substitute-performance provenance timestamp;
15. prove changing/reverting the exercise is blocked after logged substitute performance;
16. reopen the logged set for correction and prove this does not erase its performed-exercise provenance or permit relabeling;
17. reload and prove the substitute remains with a visible locked-history state.

## Data / source gates

The source audit additionally proves:

- private athlete equipment updates use the normal local-first/outbox persistence path;
- previous performance is looked up by the exercise actually performed;
- `DO NOT DEFAULT` relationships cannot reach the Apply path;
- structured load governance fails safe to RPE-guided/manual loading when no verified conversion exists;
- Black Crown Machine Hip Abduction → band variants explicitly use `no-load-transfer`;
- the public Exercise Intelligence viewer has no direct IndexedDB/localStorage write path;
- active workout mutations do not take ownership of program packages.

## Remaining integration gates before merge

- Inspect History/Progress/PR consumers on the finished production assembly and verify actual performance is attributed to the substitute while program completion remains attributed to the programmed slot.
- Verify Bar Loader follows the substitute working load in a governed barbell-loaded case without inventing a load conversion solely for testing.
- Re-run the full lifecycle injury/substitution athlete using the real persisted substitution path after #54 is green.
- Merge only from an exact green PR head; production Netlify release remains a separate explicit action.
