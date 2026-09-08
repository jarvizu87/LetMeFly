# LetMeFly V5.4 Progression Shadow Runtime v3 Overlay

Runtime v3 adds pilot-readiness guards on top of the effective-prescription runtime-v2 work.

It does not make progression visible. It makes unresolved Yellow decisions explicit and machine-auditable so a visible pilot cannot silently rely on inference.

Added behavior:
- structured `ShadowDecisionGap` records for Yellow sessions;
- `MANDATORY_EFFECTIVE_TARGET_MISSING` when reduced mandatory work lacks an explicit effective target;
- `CONDITIONAL_STATE_MISSING` when source-conditional Yellow work lacks an explicit active/inactive decision;
- Shadow runtime result exposes `decisionGapCount` and `pilotDecisionCoverageClean`;
- dedicated `progressionShadowPilotMappingCheck()`;
- pilot checklist with Green/Yellow/Red entry gates;
- audit coverage proving a fully governed Yellow fixture reaches zero decision gaps.

Validation:
- progression Shadow audit: PASS
- source/security audit: PASS
- Crownforge Weeks 1-6 regression: PASS
- Exercise Intelligence audit: PASS
- no visible XP/Quest UI
- no Crownforge/Black Crown programming changes
