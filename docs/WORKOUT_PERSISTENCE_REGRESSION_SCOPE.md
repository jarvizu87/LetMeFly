# Workout Persistence Regression Scope

This lane exists to fix three separate workout-mode issues observed in real LetMeFly session recordings:

1. **Persistence / review count mismatch** — entered sets appeared saved in the workout UI but Session Review remained at `5 / 48`, preventing normal workout completion.
2. **Unprescribed load carry-forward** — when an exercise has no program-prescribed load, the actual load logged on a completed set should prefill the next set for the same exercise. Any program-prescribed load, whether percentage/TM-based or explicit fixed load, remains authoritative and must never be replaced by carry-forward.
3. **Mobile day-scroll conflict** — vertical swipes inside Workout Mode can move the horizontally snapping workout-section viewport instead, pulling the athlete back toward the active card/section and making the rest of the day difficult to reach.

The persistence issue is the critical path. The native set button and native IndexedDB workout service remain the authoritative persistence boundary. UI overlays must not create a second workout ledger or write directly around that service.

For mobile section navigation, vertical document scrolling takes priority. Readiness / workout-section / Review navigation remains available through the existing session track and previous/next arrows. Horizontal set-tab scrolling inside an exercise remains available.
