# Workout Persistence Regression Scope

This lane exists to fix two separate workout-logging issues observed in a real LetMeFly session recording:

1. **Persistence / review count mismatch** — entered sets appeared saved in the workout UI but Session Review remained at `5 / 48`, preventing normal workout completion.
2. **Unprescribed load carry-forward** — when an exercise has no program-prescribed load, the actual load logged on a completed set should prefill the next set for the same exercise. Any program-prescribed load, whether percentage/TM-based or explicit fixed load, remains authoritative and must never be replaced by carry-forward.

The persistence issue is the critical path. The native set button and native IndexedDB workout service remain the authoritative persistence boundary. UI overlays must not create a second workout ledger or write directly around that service.
