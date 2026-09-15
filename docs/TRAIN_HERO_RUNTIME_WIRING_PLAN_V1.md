# Train Hero Runtime Wiring Plan V1

Branch scope: wire the locked Train Hero Art Pack V1 into the current approved Train UI while preserving governed program logic and athlete-private data.

## Runtime rules

- Hero selection is presentation-only.
- The selected hero follows the currently selected governed workout/day.
- Selection is deterministic from workout emphasis; no random rotation.
- Testing/realization/peak semantics win first, then yoke/trap, Olympic/explosive, overhead/vertical press, deadlift/hinge, squat/lower, conditioning/carries, bench/upper push, then accessory/recovery fallback.
- Changing days updates the hero immediately on desktop and mobile.
- Future-day preview remains read-only and does not mutate program state.
- A missing/unavailable hero fails to the locked accessory/recovery fallback rather than returning to the old single squat/lifter art.

## Required validation

- Day 1 → Day 4 hero changes when emphasis differs.
- Every locked key can be selected by a synthetic workout descriptor.
- The retired `/ui/train-lifter.webp` hard-coded ownership is removed from the Train header.
- Program prescription objects remain byte/logically unchanged by hero selection.
- No athlete-private state is written by hero selection.
- Existing Train/Day 4 parity, Command V2, seven-athlete, persistence, cloud, lifecycle and EI gates remain green.
