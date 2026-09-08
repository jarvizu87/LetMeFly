# LetMeFly V5.4 Progression Shadow Runtime v8 Overlay

Runtime v8 hardens the first real Shadow pilot with tamper-evident evidence provenance and a fail-closed visible-progression authorization boundary.

It adds:
- stable SHA-256 provenance for the exact mapped `WorkoutPrescription` and `WorkoutOutcome` at the ORIGINAL completion hook;
- immutable storage of that provenance in the private pilot journal;
- later pilot-evidence reconciliation against the original-hook provenance;
- blocking of missing, legacy, or mismatched provenance before visible-pilot status can pass;
- pilot evidence schema v2 for the provenance contract;
- a read-only visibility authorization helper that still requires an explicit operator/app enable flag after the stored Shadow pilot passes;
- an independent human XP-review worksheet for Forge XP ruleset 1.0.0.

Validation in the isolated V5.4 candidate:
- source/security audit: PASS; private localStorage writes: 0;
- Crownforge Weeks 1–6 regression: PASS;
- Exercise Intelligence audit: PASS;
- progression Shadow audit: PASS;
- all 42 embedded Crownforge days Green mapping: 42/42 PASS;
- Yellow effective-prescription fixture: PASS;
- RED safety fixture: PASS;
- stable provenance key-order invariance: PASS;
- changed completion evidence changes provenance: PASS;
- missing provenance blocks stored pilot: PASS;
- provenance mismatch blocks stored pilot: PASS;
- visibility remains locked without explicit operator enable: PASS;
- strict TypeScript compile through the progression audit harness: PASS.

No XP, Quest, Rank, or achievement UI is enabled. No training prescription is changed.
