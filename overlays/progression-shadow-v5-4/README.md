# LetMeFly V5.4 Progression Shadow Handoff

This handoff is intentionally isolated from the active UI/deployment lane.

## Base

- Repository: `jarvizu87/LetMeFly`
- Base branch: `runtime-state-hardening`
- Base commit: `acad86e146860ae24a48f08eb607cefc43438d5a`
- Canonical app source archive: `LETMEFLY_REBUILT_SOURCE_V5_4.zip`
- Source archive SHA-256: `48aa4bde71f768d77aa8ba916d53c29c756d31896d6386a2c3cf23831d2492a7`
- Package version: `5.4.0-rebuild.1`

## Purpose

Preserve the completed Progression Shadow integration in its own branch without changing the active UI/runtime branches or deployment.

The complete integration is stored as a gzip-compressed patch, base64-encoded and split into numbered text parts under `patch/` so the branch remains text-only.

## Reassemble and verify

```bash
cat overlays/progression-shadow-v5-4/patch/patch.gz.b64.* > /tmp/letmefly-v5_4-progression-shadow.patch.gz.b64
base64 -d /tmp/letmefly-v5_4-progression-shadow.patch.gz.b64 > /tmp/letmefly-v5_4-progression-shadow.patch.gz
gzip -dc /tmp/letmefly-v5_4-progression-shadow.patch.gz > /tmp/letmefly-v5_4-progression-shadow.patch

sha256sum /tmp/letmefly-v5_4-progression-shadow.patch.gz
# d55787b23491451cbd486958f5f8da32e3e625d6e3a0ce372e19af0b7885bcdb

sha256sum /tmp/letmefly-v5_4-progression-shadow.patch
# fc8a76db5faf16d5bf2326fb8b6f766d77d03926b1584d7e3f433aca51be4a54

git apply --check /tmp/letmefly-v5_4-progression-shadow.patch
git apply /tmp/letmefly-v5_4-progression-shadow.patch
```

See `patch/CHECKSUMS.md` for the encoded archive and individual part checksums.

## What the integration does

- vendors the LetMeFly Progression Engine v1.6 contract source;
- maps the real V5.4 private workout schema to progression;
- uses `program_instance_id` as `programRunId`;
- aggregates warm-up drills into the governed warm-up XP block;
- separates optional top-of-range sets from core adherence;
- preserves original XP identity for approved substitutions;
- requires explicit Yellow conditional activation rather than guessing;
- stores Shadow data in private IndexedDB `letmefly-progression-shadow-v1`;
- adds only four invisible runtime hooks: boot replay, readiness reward, workout prepare, workout completion;
- renders no XP in active Workout Mode;
- changes no Crownforge or Black Crown programming.

## Reproducibility

The complete patch was applied to a fresh copy of the exact V5.4 source archive and reproduced the integrated candidate byte-for-byte, ignoring filesystem metadata and generated audit output.

Validation passed:
- strict TypeScript app audit;
- source/private-data audit with 0 private localStorage writes;
- Crownforge Weeks 1–6 audits/regression (42 days);
- Exercise Intelligence audit;
- canonical W1D1 Progression Shadow audit.

W1D1 Green/full-completion fixture: 752 workout XP + 10 readiness XP = 762 Shadow ledger XP; Main Quest COMPLETE; 0 pending commands; 0 dead letters; Shadow health PASS.

This is a canonical program/schema fixture, not a claim about an athlete's actual completed performance.

## Current intentional limitation

V5.4 stores Yellow readiness/cut guidance as prose rather than a structured per-exercise effective prescription. The adapter refuses to guess which conditional items remain active. That decision belongs to the Program/Coach layer before visible progression rollout.

Do not merge this overlay blindly into a moving UI branch. Rebase/apply it when the app lane is stable, preserve the latest UI behavior, rerun the audits, and run at least three real workouts in SHADOW mode before showing Quest/Progress UI.
