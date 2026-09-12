# LetMeFly Locked Mockup Fidelity Standard v1

Status: **LOCKED / SOURCE OF TRUTH**

The approved tab mockups are design decisions, not optional inspiration. Once a mockup is locked, implementation work must match its approved hierarchy, art role, spacing intent, color language, and interaction model unless a later explicit design decision supersedes it.

A meaningful visual deviation is treated as a fidelity bug. It is not a reason to reopen the design decision.

## Authoritative tab direction

### Home
- Use the recovered exact approved Home mockup as the visual reference.
- Keep the approved red/black command identity, red mountain landscape, approved wolf treatment, combined greeting/command composition, and intelligence-card hierarchy.
- Do not substitute later recreations for the recovered locked reference.

### Train
- Keep the approved readiness-first workout execution layout.
- Exact governed exercise images remain the movement source of truth.
- Raizen/Fenrir identity art must never replace exercise demonstration art.

### Program
- Keep the approved program/week command-center hierarchy.
- Preserve cinematic mountain/program identity without inventing program state or forcing mockup sample data onto the athlete.
- Live program phase/week/day data always remain authoritative.

### Progress
- Keep the approved analytics hierarchy and live metrics.
- Use a strong cinematic Raizen + Fenrir identity hero consistent with the locked mockup rather than a wolf-only decorative badge.
- Identity art may not obscure metrics, tabs, or trend readability.

### Exercises
- Use Raizen + Fenrir only in the identity hero.
- Keep exact governed exercise imagery in library/detail/substitution surfaces.
- WATCH / INFO / SUBSTITUTE remain practical movement actions and may not be replaced by identity art.

### Coach
- Conversation remains central and native Coach controls remain authoritative.
- The locked mockup calls for Raizen + Fenrir identity art around the workspace, with mountain/storm support art.
- Do not fabricate chat history, coaching evidence, or athlete state to imitate a mockup.

### Profile
- Use the approved character-sheet composition.
- No circular profile/avatar photo.
- The character-art panel is explicitly Raizen + Fenrir identity art.
- Current Program, Training Maxes, Goal Tracker, Quick Actions, and Recent Training remain based on actual athlete data.

### More
- Keep the approved tools/resources/settings hub.
- The lower brand panel uses cinematic Raizen + Fenrir identity treatment from the locked mockup direction.
- Cards continue to route to existing capability owners; art never creates placeholder functionality.

## Shared visual system

- black / charcoal / steel = application base
- red = primary brand, environment, command/action, active-selection accent
- purple = secondary Raizen/Fenrir energy, runes, gamification, and special identity detail
- white / gray = information hierarchy
- green / blue / gold may remain where their information semantics are already intentionally defined

## Art boundary

LetMeFly uses two different art roles:

1. **Identity/world art:** Raizen, Fenrir, mountains, storms, crowns, runes, motivational scenes.
2. **Exercise instruction art:** exact movement imagery used to identify/demonstrate an exercise.

These roles must not be collapsed. Identity art belongs in heroes, banners, profile character art, milestones, and branding. Exercise art belongs in Train/Exercises/substitution/instruction surfaces.

## State/data boundary

Mockup fidelity must never rewrite:

- Crownforge or Black Crown prescriptions
- sets / reps / load / RPE / RIR
- progression rules
- workout history or persistence
- training maxes
- readiness
- private athlete data
- Exercise Intelligence records
- Coach decision logic

Mockup sample data is illustrative only. The live athlete/program data is authoritative.

## Implementation reference

The final locked-art correction is isolated in:

- `overlays/ui-command-v2/batch-aq/locked-art-fidelity-v1.css`
- `overlays/ui-command-v2/static/raizen-black-crown-ascension-v1.jpg`
- `ci/install-locked-art-fidelity-v1.sh`
- `ci/audit-locked-art-fidelity-v1.mjs`

The canonical Raizen/Fenrir raster is derived from the approved Raizen Black Crown Ascension reference rather than a generated placeholder or blurred reconstruction.

This final layer loads after color harmonization so the locked artwork decisions cannot be silently watered down by earlier generic styling layers.

## Release acceptance

A release is visually acceptable only when:

- the implementation respects the locked mockups as decisions;
- Home uses the recovered authoritative reference;
- Raizen + Fenrir appear where the locked Progress / Exercises / Coach / Profile / More designs call for identity art;
- governed exercise images remain unchanged as movement art;
- red remains primary and purple secondary;
- mobile and desktop layouts remain readable with no page-level overflow;
- no state/data/program behavior is changed for visual fidelity.
