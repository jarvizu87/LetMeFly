# LetMeFly V5.4 Progression Shadow Runtime v2 Overlay

This overlay advances the existing V5.4 Shadow runtime integration with explicit effective-prescription support.

The private app already contains `coachingDecisions`. Runtime v2 now:
- records Coach/program-authorized per-exercise effective targets through the existing local mutation + sync outbox path;
- stores exercise-specific detail inside `before_state` / `after_state` JSON, avoiding an unverified cloud column;
- resolves the latest active decision at or before workout completion;
- maps the governed target into `CompletionRecord.effectivePrescribedUnits`;
- lets explicit decisions activate/deactivate source-conditional work;
- preserves RED as the safety authority;
- caps malformed/imported oversized effective targets at the governed source prescription;
- keeps source-optional work from becoming core adherence.

Validation in the isolated V5.4 candidate:
- strict TypeScript audit: PASS
- source/security audit: PASS
- Crownforge Weeks 1-6 regression: PASS
- Exercise Intelligence audit: PASS
- all 42 embedded Crownforge days Green mapping: 42/42 PASS
- effective-prescription audit: PASS
- Yellow fixture: 552 XP conservative fallback -> 668 XP with explicit governed decisions, including 30 XP session bonus
- RED fixture session bonus: 0

Visible progression remains disabled.
