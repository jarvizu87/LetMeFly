# LetMeFly Workout Flow Edge Audit v1

Status: locked UI QA pass for the current Crownforge and Black Crown program sources.

## Governing sources reviewed

- Crownforge: `CROWNFORGE_REVISED_INTEGRATED_v2_1_APPROVED_CIRCUIT_STYLE_SPACED_BLACK_CROWN_COLOR_BLOCKS.docx`
- Black Crown: `BLACK_CROWN_REVISED_54_WEEK_PROGRAM_v2_0_APPROVED_WAVE_CIRCUIT_STYLE_SPACED.docx`

The UI audit is presentation-only. It does not rewrite program prescriptions, loads, priorities, or completion history.

## Real Crownforge cases covered

- Week 1 Main Strength Circuit uneven-set drop-off: Front Squat 7 sets, Bench 4, Chest-Supported Row 4, KB Swing 3, Hanging Knee Raise 3, Backward Sled Drag 4.
- Main/receiving circuits where support drills finish before the barbell lift and the remaining main-lift sets must continue alone.
- Two-round, three-round, four-round, and conditional 3–4-round support circuits.
- Ten-set waves, including Bench waves and support work that reaches R10.
- Straight-set blocks outside circuits.
- Long names such as `Clean-Grip RDL to Knee`, `Wrist Flexor/Extensor Pulses`, and `Pull-Up or Lat Pulldown`.
- Crownforge governance where RPE is frequently blank because exact load / percentage remains authoritative.

## Real Black Crown cases covered

- Straight-set primary and secondary work from 2 through 6 sets.
- Five-line Sheiko base waves where each work set has its own reps/load prescription.
- Missing RPE as a valid state; RPE language is an effort ceiling where shown, not a required main-lift load field.
- Long names / alternatives such as `Farmer Carry (Trap-Bar Carry acceptable)` and `Pallof Press OR Side Plank`.
- One-exercise sections whose heading contains `CIRCUIT / LOW-INTENSITY WORK`; these must not be falsely converted into round-based multi-exercise circuit navigation.

## Supported formats not explicitly present in the current program text

The current reviewed Crownforge v2.1 and Black Crown v2.0 Word sources do not use explicit `superset`, `tri-set`, `giant set`, or `pyramid` labels as governing workout structures. Their shared UI support remains locked and is regression-checked synthetically so later programs can use the same language without a redesign.

## Fixes locked by this pass

1. 320–360px phone widths keep Reps / Load / RPE as three equal cells; the completion button no longer steals a permanent fourth metric column.
2. 10+ set selectors horizontally scroll and the active set auto-centers.
3. Compact exercise names and prescriptions may use two lines rather than disappearing behind a one-line ellipsis.
4. Compact / Next thumbnails use `contain` so approved square art is not cropped again.
5. Blank load/RPE inputs visibly remain unset with an em-dash placeholder.
6. Empty plate-helper text falls back to `Load / bodyweight as prescribed` rather than implying a required barbell load.
7. One-card sections are always treated as sequential even if their heading contains `circuit`.
8. Completing the final movement of a round creates a real between-round rest gate before the next round expands.
9. Reopening a completed set clears any pending rest gate and keeps the reopened work selected.
10. The ordinary sequential `NEXT SET` strip now points to the following incomplete set rather than echoing the current set.
11. Round maximums use actual set numbers, supporting uneven/drop-off circuits correctly.
12. Superset / tri-set / giant-set / circuit recognition remains in the common flow engine.

## CI boundary

`ci/audit-workout-flow-edge-cases.mjs` runs on every Command V2 build and covers the real Crownforge uneven-set fixture, a real Crownforge 10-set fixture, a real Black Crown five-set/blank-RPE fixture, reopened-set behavior, one-card circuit-label protection, 12+ set scrolling, long-name treatment, and the between-round rest gate.
